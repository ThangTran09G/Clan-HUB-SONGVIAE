const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
// Render: set ADMIN_PASSWORD and JWT_SECRET in Environment for production.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "AdminCOC";
const DATA_FILE = path.join(__dirname, "data.json");
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

function loadData() {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return { names: Array.isArray(data.names) ? data.names : [], winners: Array.isArray(data.winners) ? data.winners : [], lastWinner: data.lastWinner || null, round: Number(data.round) || 0, members: Array.isArray(data.members) ? data.members : [], paymentQr: typeof data.paymentQr === "string" ? data.paymentQr : "" };
  } catch { return { names: [], winners: [], lastWinner: null, round: 0, members: [], paymentQr: "" }; }
}
let state = loadData();
function saveData() { fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), "utf8"); }
function publicState() { return { names: state.names, winners: state.winners, lastWinner: state.lastWinner, round: state.round }; }
function isAdmin(socket) { return socket.data.isAdmin === true; }
function sendError(socket, message) { socket.emit("admin:error", message); }
const adminTokens = new Map();
function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const expiry = adminTokens.get(token);
  if (!token || !expiry || expiry < Date.now()) { adminTokens.delete(token); return res.status(401).json({ error: "Phiên Admin hết hạn. Vui lòng đăng nhập lại." }); }
  next();
}
function cleanMember(input, existing = {}) {
  const str = v => typeof v === "string" ? v.trim().slice(0, 200) : "";
  const gameIds = Array.isArray(input.gameIds) ? input.gameIds.slice(0, 30).map(g => ({
    gameTag: str(g.gameTag).toUpperCase(), gameName: str(g.gameName), townHall: str(g.townHall), rank: ["Thủ lĩnh", "Đồng thủ lĩnh", "Hội viên"].includes(g.rank) ? g.rank : "Hội viên"
  })).filter(g => g.gameTag || g.gameName || g.townHall) : (existing.gameIds || []);
  const id = existing.id || crypto.randomUUID();
  const member = {
    id, approvalStatus: existing.approvalStatus || "approved", name: str(input.name), zaloName: str(input.zaloName), phone: str(input.phone), status: input.status === "Không hoạt động" ? "Không hoạt động" : "Đang hoạt động",
    bankName: str(input.bankName), bankAccount: str(input.bankAccount), bankRecipient: str(input.bankRecipient), gameIds,
    paymentPaid: existing.paymentPaid === true,
    createdAt: existing.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  if (!member.name) throw new Error("Vui lòng nhập họ tên / biệt danh.");
  if (!member.phone) throw new Error("Vui lòng nhập số điện thoại.");
  return member;
}
function safeMember(m) { return { id: m.id, name: m.name, zaloName: m.zaloName, status: m.status, gameIds: m.gameIds || [], paymentPaid: m.paymentPaid === true }; }
app.get("/health", (_req, res) => res.json({ ok: true }));
app.post("/api/admin/login", (req, res) => {
  if (!req.body || req.body.password !== ADMIN_PASSWORD) return res.status(401).json({ error: "Mật khẩu chưa đúng." });
  const token = crypto.randomBytes(32).toString("hex"); adminTokens.set(token, Date.now() + 8 * 60 * 60 * 1000);
  res.json({ token, expiresIn: 28800 });
});
app.get("/api/members", (_req, res) => res.json({ members: state.members.map(m => { m.approvalStatus = "approved"; return safeMember(m); }) }));
app.post("/api/register-member", (req, res) => {
  try {
    const input = req.body || {};
    const member = cleanMember(input);
    const requiredFields = [[member.name, "Họ tên / biệt danh"], [member.phone, "Số điện thoại"], [member.zaloName, "Tên tài khoản Zalo"], [member.bankName, "Tên ngân hàng"], [member.bankAccount, "Số tài khoản ngân hàng"], [member.bankRecipient, "Tên người nhận"], [input.status, "Trạng thái hoạt động"]];
    const missing = requiredFields.find(([value]) => !value);
    if (missing) return res.status(400).json({ error: `Vui lòng nhập ${missing[1]}.` });
    if (!Array.isArray(input.gameIds) || input.gameIds.length < 1) return res.status(400).json({ error: "Vui lòng thêm ít nhất một ID game." });
    if (!["Đang hoạt động", "Không hoạt động"].includes(input.status)) return res.status(400).json({ error: "Vui lòng chọn trạng thái hoạt động." });
    const incompleteGame = input.gameIds.find(g => !g || !String(g.gameTag || "").trim() || !String(g.gameName || "").trim() || !String(g.townHall || "").trim() || !["Thủ lĩnh", "Đồng thủ lĩnh", "Hội viên"].includes(g.rank));
    if (incompleteGame) return res.status(400).json({ error: "Vui lòng điền đủ Game Tag, tên trong game, Town Hall và cấp bậc cho từng ID." });
    member.approvalStatus = "approved";
    state.members.push(member); saveData();
    res.status(201).json({ ok: true, message: "Đăng ký thành công! Thông tin đã được thêm ngay vào danh sách thành viên Clan." });
  } catch (e) { res.status(400).json({ error: e.message || "Thông tin đăng ký chưa hợp lệ." }); }
});
app.get("/api/payment-info", (_req, res) => res.json({ qr: state.paymentQr || "", members: state.members.map(m => ({ id: m.id, name: m.name, paymentPaid: m.paymentPaid === true })) }));
app.post("/api/admin/payment-qr", auth, (req, res) => {
  const qr = typeof req.body?.qr === "string" ? req.body.qr : "";
  if (qr && (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(qr) || qr.length > 4_500_000)) return res.status(400).json({ error: "Ảnh QR không hợp lệ hoặc quá lớn (tối đa khoảng 3 MB)." });
  state.paymentQr = qr;
  saveData();
  res.json({ ok: true, message: qr ? "Đã cập nhật mã QR chuyển khoản." : "Đã xóa mã QR." });
});
app.patch("/api/admin/members/:id/payment", auth, (req, res) => {
  const member = state.members.find(m => m.id === req.params.id);
  if (!member) return res.status(404).json({ error: "Không tìm thấy thành viên." });
  member.paymentPaid = req.body?.paid === true;
  saveData();
  res.json({ ok: true, member: { id: member.id, paymentPaid: member.paymentPaid } });
});
app.get("/api/admin/members", auth, (_req, res) => res.json({ members: state.members }));
app.post("/api/admin/members", auth, (req, res) => {
  try { const member = cleanMember(req.body || {}); state.members.push(member); saveData(); res.status(201).json({ member }); }
  catch (e) { res.status(400).json({ error: e.message || "Dữ liệu không hợp lệ." }); }
});
app.put("/api/admin/members/:id", auth, (req, res) => {
  const index = state.members.findIndex(m => m.id === req.params.id); if (index < 0) return res.status(404).json({ error: "Không tìm thấy thành viên." });
  try { state.members[index] = cleanMember(req.body || {}, state.members[index]); saveData(); res.json({ member: state.members[index] }); }
  catch (e) { res.status(400).json({ error: e.message || "Dữ liệu không hợp lệ." }); }
});
app.delete("/api/admin/members/:id", auth, (req, res) => {
  const index = state.members.findIndex(m => m.id === req.params.id); if (index < 0) return res.status(404).json({ error: "Không tìm thấy thành viên." });
  state.members.splice(index, 1); saveData(); res.json({ ok: true });
});
app.get("/api/admin/export.csv", auth, (_req, res) => {
  const esc = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const rows = [["Họ tên", "Tên Zalo", "Số điện thoại", "Trạng thái", "Game Tag", "Tên trong game", "Town Hall", "Cấp bậc", "Ngân hàng", "Số tài khoản", "Tên người nhận"]];
  for (const m of state.members) {
    const games = m.gameIds && m.gameIds.length ? m.gameIds : [{}];
    for (const g of games) rows.push([m.name, m.zaloName, m.phone, m.status, g.gameTag, g.gameName, g.townHall, g.rank, m.bankName, m.bankAccount, m.bankRecipient]);
  }
  const csv = '\ufeff' + rows.map(row => row.map(esc).join(",")).join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", 'attachment; filename="thanh-vien-song-vi-ae.csv"'); res.send(csv);
});

io.on("connection", socket => {
  socket.emit("state:update", publicState());
  socket.on("admin:login", password => {
    if (typeof password === "string" && password === ADMIN_PASSWORD) { socket.data.isAdmin = true; socket.emit("admin:login-result", { ok: true }); }
    else socket.emit("admin:login-result", { ok: false, message: "Mật khẩu chưa đúng." });
  });
  socket.on("admin:set-names", rawNames => {
    if (!isAdmin(socket)) return sendError(socket, "Chỉ Admin mới được sửa danh sách.");
    if (typeof rawNames !== "string") return sendError(socket, "Danh sách không hợp lệ.");
    const names = [...new Set(rawNames.split(/\r?\n|,/).map(n => n.trim()).filter(Boolean))];
    if (names.length < 2) return sendError(socket, "Vui lòng nhập ít nhất 2 tên.");
    if (names.length > 1000) return sendError(socket, "Tối đa 1.000 người tham gia.");
    state.names = names; state.winners = state.winners.filter(w => names.includes(w.name));
    if (state.lastWinner && !names.includes(state.lastWinner.name)) state.lastWinner = null;
    saveData(); io.emit("state:update", publicState()); socket.emit("admin:notice", "Đã cập nhật " + names.length + " người tham gia.");
  });
  socket.on("admin:spin", () => {
    if (!isAdmin(socket)) return sendError(socket, "Chỉ Admin mới được nhấn quay.");
    const alreadyWon = new Set(state.winners.map(w => w.name)); const eligible = state.names.filter(name => !alreadyWon.has(name));
    if (!eligible.length) return sendError(socket, "Không còn người chưa trúng. Hãy cập nhật danh sách hoặc đặt lại lịch sử.");
    const winnerIndex = Math.floor(Math.random() * eligible.length), winner = eligible[winnerIndex];
    state.round += 1; state.lastWinner = { name: winner, round: state.round, time: new Date().toISOString() }; state.winners.push(state.lastWinner); saveData();
    io.emit("spin:start", { winner, winnerIndex, round: state.round, duration: 5200, time: state.lastWinner.time, eligibleCount: eligible.length });
    setTimeout(() => io.emit("state:update", publicState()), 5350);
  });
  socket.on("admin:reset-winners", () => {
    if (!isAdmin(socket)) return sendError(socket, "Chỉ Admin mới được đặt lại lịch sử.");
    state.winners = []; state.lastWinner = null; state.round = 0; saveData(); io.emit("state:update", publicState()); socket.emit("admin:notice", "Đã đặt lại lịch sử trúng thưởng.");
  });
});
server.listen(PORT, "0.0.0.0", () => console.log(`Sống Vì AE đang chạy tại http://localhost:${PORT}`));

/**
 * userController.js
 * -----------------
 * Handles user authentication, registration, login, profile updates, and password management.
 *
 * Exports:
 *  - register: Register a new user (MongoDB or file fallback).
 *  - login: Login user and generate JWT token.
 *  - updateProfile: Update user profile (email, username, name).
 *  - changePassword: Change existing user password.
 *  - addPassword: Add a password for users without one.
 *  - getProfile: Fetch user profile info.
 *  - updateAvatar: Upload or update user avatar/picture.
 *  - deleteAvatar: Remove user avatar/picture.
 */

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getDb } = require("../config/db");
const usersService = require("../services/usersService");

const USERS_FILE = path.join(__dirname, "..", "cache", "users.json");
const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
const JWT_SECRET =
  process.env.JWT_SECRET_KEY || process.env.JWT_SECRET || "dev-secret";
const JWT_EXPIRES = process.env.ACCESS_TOKEN_EXPIRE_MINUTES || "10080";

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/** Helper: read users from local file fallback */
function readUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8") || "[]");
  } catch {
    return [];
  }
}

/** Helper: write users to local file fallback */
function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

/** Helper: create JWT token */
function createToken(sub) {
  const expiresIn = parseInt(JWT_EXPIRES, 10) * 60;
  return jwt.sign({ sub }, JWT_SECRET, { expiresIn });
}

/** Helper: get users collection or fallback file */
async function getUserCollection() {
  try {
    const db = getDb();
    return db.collection("users");
  } catch {
    return null;
  }
}

/** Helper: get user by ID */
async function getUserById(userId) {
  const usersCol = await getUserCollection();
  if (usersCol) {
    const ObjectId = require("mongodb").ObjectId;
    return usersCol.findOne({ _id: new ObjectId(userId) });
  }
  return readUsers().find((u) => u.id === userId);
}


/** -------------------- REGISTER -------------------- */
exports.register = async (req, res) => {
  const { email, password, name, username } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Missing email or password" });

  try {
    const usersCol = await getUserCollection();
    const hashed = await bcrypt.hash(password, 10);

    if (usersCol) {
      // Check existing
      const existing = await usersCol.findOne({ email });
      if (existing)
        return res.status(400).json({ error: "Email already registered" });

      const r = await usersCol.insertOne({
        lineid: "",
        email,
        password: hashed,
        name: name || "",
        username: username || "",
        createdAt: new Date(),
        role: "user",
        pictureUrl: null,
        lastLogin: new Date(),
        loginMethod: "mail",
        sentOption : "mail",
        timeZone: "Asia/Tokyo"
      });
      const id = r.insertedId.toString();
      const token = createToken(id);
      return res
        .status(201)
        .json({ token, user: { id, email, name, username } });
    }

    // file fallback
    const users = readUsers();
    if (users.some((u) => u.email === email))
      return res.status(400).json({ error: "Email already registered" });
    const newUser = {
      id: crypto.randomBytes(12).toString("hex"),
      email,
      password: hashed,
      name: name || "",
      username: username || "",
      createdAt: new Date().toISOString(),
    };
    users.push(newUser);
    writeUsers(users);
    const token = createToken(newUser.id);
    return res
      .status(201)
      .json({
        token,
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          username: newUser.username,
        },
      });
  } catch (err) {
    console.error("register error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/** -------------------- LOGIN -------------------- */
exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Missing email or password" });

  try {
    const usersCol = await getUserCollection();
    let user = null;
    if (usersCol) {
      user = await usersCol.findOne({ email });
      if (!user) return res.status(401).json({ error: "Invalid credentials" });
      const ok = await bcrypt.compare(password, user.password);
      if (!ok) return res.status(401).json({ error: "Invalid credentials" });
      const id = user._id.toString();
      const token = createToken(id);
      await usersCol.updateOne(
        { _id: user._id },
        { $set: { lastLogin: new Date() ,
          loginMethod: "mail"
        } }
      );
      return res.json({
        token,
        user: {
          id,
          email: user.email,
          name: user.name,
          username: user.username,
          loginMethod: user.loginMethod,
            timeZone: user.timeZone
        },
      });
    }

    const users = readUsers();
    const u = users.find((x) => x.email === email);
    if (!u) return res.status(401).json({ error: "Invalid credentials" });
    const ok = await bcrypt.compare(password, u.password);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });
    const token = createToken(u.id);
    return res.json({
      token,
      user: { id: u.id, email: u.email, name: u.name, username: u.username },
    });
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/** -------------------- CHANGE PASSWORD -------------------- */
exports.changePassword = async (req, res) => {
  const { userId, currentPassword, newPassword } = req.body;
  console.debug("[usersController.changePassword] called", {
    reqUserId: req.userId,
    bodyUserId: userId,
  });
  if (!userId || !currentPassword || !newPassword)
    return res.status(400).json({ error: "Missing required fields" });
  if (newPassword.length < 6)
    return res
      .status(400)
      .json({ error: "Password must be at least 6 characters" });

  try {
    const usersCol = await getUserCollection();
    console.debug("[changePassword] usersCol available?", !!usersCol);
    let user = await getUserById(userId);
    console.debug(
      "[changePassword] resolved user",
      !!user,
      user && (user._id || user.id)
    );
    if (!user) return res.status(404).json({ error: "User not found" });

    const ok = await bcrypt.compare(currentPassword, user.password);
    console.debug("[changePassword] password compare result:", !!ok);
    if (!ok)
      return res.status(401).json({ error: "Current password is incorrect" });

    const hashed = await bcrypt.hash(newPassword, 10);

    if (usersCol) {
      const ObjectId = require("mongodb").ObjectId;
      await usersCol.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { password: hashed } }
      );
    } else {
      const users = readUsers();
      const idx = users.findIndex((u) => u.id === userId);
      users[idx].password = hashed;
      writeUsers(users);
    }

    return res.json({ message: "Password changed successfully" });
  } catch (err) {
    console.error("changePassword error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/** -------------------- ADD PASSWORD -------------------- */
exports.addPassword = async (req, res) => {
  const { userId, newPassword } = req.body;
  if (!userId || !newPassword)
    return res.status(400).json({ error: "Missing userId or password" });
  if (newPassword.length < 6)
    return res
      .status(400)
      .json({ error: "Password must be at least 6 characters" });

  try {
    let user = await getUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.password)
      return res.status(400).json({ error: "User already has a password" });

    const hashed = await bcrypt.hash(newPassword, 10);
    const usersCol = await getUserCollection();

    if (usersCol) {
      const ObjectId = require("mongodb").ObjectId;
      await usersCol.updateOne(
        { _id: new ObjectId(userId) },
        { $set: { password: hashed } }
      );
    } else {
      const users = readUsers();
      const idx = users.findIndex((u) => u.id === userId);
      users[idx].password = hashed;
      writeUsers(users);
    }

    return res.json({ message: "Password added successfully" });
  } catch (err) {
    console.error("addPassword error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/** -------------------- GET PROFILE -------------------- */
exports.getProfile = async (req, res) => {
  const userId = req.userId || req.query.userId || req.body.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const usersCol = await getUserCollection();
    let user = null;

    if (usersCol) {
      const { ObjectId } = require("mongodb");
      user = await usersCol.findOne({ _id: new ObjectId(userId) });
      if (!user) return res.status(404).json({ error: "User not found" });
      return res.json({
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          username: user.username,
          pictureUrl: user.pictureUrl || user.avatar || null,
          loginMethod: user.loginMethod,
          timeZone: user.timeZone
        },
      });
    }

    const users = readUsers();
    const u = users.find((x) => x.id === userId);
    if (!u) return res.status(404).json({ error: "User not found" });
    return res.json({
      user: {
        id: u.id,
        email: u.email,
        name: u.name,
        username: u.username,
        pictureUrl: u.pictureUrl || u.avatar || null,
      },
    });
  } catch (err) {
    console.error("getProfile error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/** -------------------- ADMIN / COMMON CRUD (no auth required here yet) -------------------- */
exports.createUser = async (req, res) => {
  try {
    const doc = req.body || {};
    const u = await usersService.createUser(doc);
    return res.status(201).json({ success: true, data: u });
  } catch (err) {
    console.error("createUser error:", err);
    return res
      .status(500)
      .json({ success: false, error: err.message || "Internal server error" });
  }
};

exports.listUsers = async (req, res) => {
  try {
    const q = req.query || {};
    const result = await usersService.getAllUsers(q);
    return res.json({
      success: true,
      data: result.data,
      meta: { total: result.total, limit: result.limit, skip: result.skip },
    });
  } catch (err) {
    console.error("listUsers error:", err);
    return res
      .status(500)
      .json({ success: false, error: err.message || "Internal server error" });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const id = req.params.id;
    const u = await usersService.getUserById(id);
    return res.json({ success: true, data: u });
  } catch (err) {
    return res
      .status(404)
      .json({ success: false, error: err.message || "User not found" });
  }
};

exports.updateUser = async (req, res) => {
  
  try {
    const id = req.params.id;
    const body = req.body || {};
    
    // 2. Execute the service call
    const updated = await usersService.updateUser(id, body);
    
    return res.json({ success: true, data: updated });
    
  } catch (err) {
    
    return res
      .status(400)
      .json({ success: false, error: err.message || "Unable to update user" });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const id = req.params.id;
    await usersService.deleteUser(id);
    return res.json({ success: true, message: "User deleted" });
  } catch (err) {
    console.error("deleteUser error:", err);
    return res
      .status(400)
      .json({ success: false, error: err.message || "Unable to delete user" });
  }
};

exports.bulkCreateUsers = async (req, res) => {
  try {
    const docs = Array.isArray(req.body) ? req.body : req.body.docs || [];
    if (!docs.length)
      return res
        .status(400)
        .json({ success: false, error: "No documents provided" });
    const r = await usersService.bulkCreateUsers(docs);
    return res.status(201).json({ success: true, data: r });
  } catch (err) {
    console.error("bulkCreateUsers error:", err);
    return res
      .status(500)
      .json({ success: false, error: err.message || "Internal server error" });
  }
};

/** -------------------- GET PREFERENCES -------------------- */
exports.getPreferences = async (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const usersCol = await getUserCollection();
    if (usersCol) {
      const { ObjectId } = require("mongodb");
      const user = await usersCol.findOne({ _id: new ObjectId(userId) });
      if (!user) return res.status(404).json({ error: "User not found" });
      return res.json({ preferences: user.preferences || {} });
    }

    const users = readUsers();
    const u = users.find((x) => x.id === userId);
    if (!u) return res.status(404).json({ error: "User not found" });
    return res.json({ preferences: u.preferences || {} });
  } catch (err) {
    console.error("getPreferences error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/** -------------------- UPDATE PREFERENCES -------------------- */
exports.updatePreferences = async (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const prefs = req.body && typeof req.body === "object" ? req.body : null;
  if (!prefs)
    return res
      .status(400)
      .json({ error: "Missing preferences in request body" });

  try {
    const usersCol = await getUserCollection();
    if (usersCol) {
      const { ObjectId } = require("mongodb");
      const r = await usersCol.findOneAndUpdate(
        { _id: new ObjectId(userId) },
        { $set: { preferences: prefs } },
        { returnDocument: "after" }
      );
      if (!r.value) return res.status(404).json({ error: "User not found" });
      return res.json({ preferences: r.value.preferences || {} });
    }

    // File fallback
    const users = readUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx === -1) return res.status(404).json({ error: "User not found" });
    users[idx].preferences = prefs;
    writeUsers(users);
    return res.json({ preferences: users[idx].preferences || {} });
  } catch (err) {
    console.error("updatePreferences error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/** -------------------- UPDATE AVATAR -------------------- */
exports.updateAvatar = async (req, res) => {
  const userId = req.userId; // assume auth middleware sets this
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const filename = req.savedFilename;
  if (!filename) return res.status(400).json({ error: "No file processed" });

  const urlPath = `/uploads/${filename}`;
  const fullUrl = `${req.protocol}://${req.get("host")}${urlPath}`;

  try {
    const usersCol = await getUserCollection();
    if (usersCol) {
      const { ObjectId } = require("mongodb");
      const r = await usersCol.findOneAndUpdate(
        { _id: new ObjectId(userId) },
        { $set: { pictureUrl: urlPath, avatar: urlPath } },
        { returnDocument: "after" }
      );
      if (!r.value) return res.status(404).json({ error: "User not found" });
    } else {
      const users = readUsers();
      const idx = users.findIndex((u) => u.id === userId);
      if (idx === -1) return res.status(404).json({ error: "User not found" });
      users[idx].pictureUrl = urlPath;
      users[idx].avatar = urlPath;
      writeUsers(users);
    }

    res.json({ message: "Avatar updated", pictureUrl: fullUrl });
  } catch (err) {
    console.error("updateAvatar error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

/** -------------------- DELETE AVATAR -------------------- */
exports.deleteAvatar = async (req, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const usersCol = await getUserCollection();
    if (usersCol) {
      const ObjectId = require("mongodb").ObjectId;
      await usersCol.updateOne(
        { _id: new ObjectId(userId) },
        { $unset: { pictureUrl: "", avatar: "" } }
      );
    } else {
      const users = readUsers();
      const idx = users.findIndex((u) => u.id === userId);
      if (idx === -1) return res.status(404).json({ error: "User not found" });
      delete users[idx].pictureUrl;
      delete users[idx].avatar;
      writeUsers(users);
    }

    return res.json({ message: "Avatar removed" });
  } catch (err) {
    console.error("deleteAvatar error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

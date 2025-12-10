/**
 * usersService.js
 * ----------------
 * Business logic for users with a file-based fallback.
 */

const usersModel = require('../models/usersModel');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');
const { login } = require('../controllers/usersController');

const USERS_FILE = path.join(__dirname, '..', 'cache', 'users.json');

function readUsersFile() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8') || '[]'); }
  catch { return []; }
}

function writeUsersFile(users) { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); }

const createUser = async (data) => {
  // Accept raw password or already hashed
  const payload = {
    email: data.email,
    password: data.password, // may be hashed already
    name: data.name || null,
    username: data.username || null,
    lineid: data.lineid || null,
    role: data.role || 'user',
    createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
    sentOption: data.sentOption || 'mail',
    loginMethod: data.loginMethod || 'mail',
  };

  // Hash if looks like plain text (not starting with $2)
  if (payload.password && !payload.password.startsWith('$2')) {
    payload.password = await bcrypt.hash(String(payload.password), 10);
  }

  try {
    return await usersModel.createUser(payload);
  } catch (err) {
    const users = readUsersFile();
    const id = ObjectId ? ObjectId().toString() : (Math.random().toString(36).slice(2));
    const newUser = { id, ...payload, createdAt: payload.createdAt.toISOString() };
    users.push(newUser);
    writeUsersFile(users);
    return newUser;
  }
};

const getAllUsers = async (query = {}) => {
  const filter = {};
  if (query.email) filter.email = query.email;
  if (query.username) filter.username = query.username;
  if (query.role) filter.role = query.role;

  const limit = parseInt(query.limit) || 100;
  const skip = parseInt(query.skip) || 0;
  const sortBy = query.sortBy || 'createdAt';
  const sortOrder = query.sortOrder === 'asc' ? 1 : -1;
  const sort = { [sortBy]: sortOrder };

  try {
    const data = await usersModel.getAllUsers(filter, { limit, skip, sort });
    return { data, total: data.length, limit, skip };
  } catch (err) {
    const users = readUsersFile();
    const data = users.filter(u => {
      if (filter.email && u.email !== filter.email) return false;
      if (filter.username && u.username !== filter.username) return false;
      if (filter.role && u.role !== filter.role) return false;
      return true;
    }).slice(skip, skip + limit);
    return { data, total: data.length, limit, skip };
  }
};

const getUserById = async (id) => {
  try {
    const u = await usersModel.getUserById(id);
    if (!u) throw new Error('User not found');
    return u;
  } catch (err) {
    const users = readUsersFile();
    const found = users.find(x => x.id === id || String(x._id) === id);
    if (!found) throw new Error('User not found');
    return found;
  }
};

const getUserByLineId = async (lineid) => {
  try {
    const u = await usersModel.getUserByLineId(lineid);
    if (!u) throw new Error('User not found');
    return u;
  } catch (err) {
    const users = readUsersFile();
    const found = users.find(x => x.lineid === lineid);
    if (!found) throw new Error('User not found');
    return found;
  }
};

const updateUser = async (id, update) => {
  // If updating password, hash it
  const payload = { ...update };
  if (payload.password && !payload.password.startsWith('$2')) {
    payload.password = await bcrypt.hash(String(payload.password), 10);
  }

  try {
    const res = await usersModel.updateUser(id, payload);
    if (!res) throw new Error('User not found');
    return res;
  } catch (err) {
    const users = readUsersFile();
    const idx = users.findIndex(x => x.id === id || String(x._id) === id);
    if (idx === -1) throw new Error('User not found');
    users[idx] = { ...users[idx], ...payload };
    writeUsersFile(users);
    return users[idx];
  }
};

const deleteUser = async (id) => {
  try {
    const ok = await usersModel.deleteUser(id);
    if (!ok) throw new Error('User not found');
    return true;
  } catch (err) {
    const users = readUsersFile();
    const idx = users.findIndex(x => x.id === id || String(x._id) === id);
    if (idx === -1) throw new Error('User not found');
    users.splice(idx, 1);
    writeUsersFile(users);
    return true;
  }
};

const bulkCreateUsers = async (docs) => {
  const validated = await Promise.all(docs.map(async d => {
    const copy = { ...d };
    if (copy.password && !copy.password.startsWith('$2')) copy.password = await bcrypt.hash(String(copy.password), 10);
    if (copy.createdAt) copy.createdAt = new Date(copy.createdAt);
    return copy;
  }));

  try { return await usersModel.bulkInsertUsers(validated); }
  catch {
    const users = readUsersFile();
    for (const u of validated) users.push(u);
    writeUsersFile(users);
    return { insertedCount: validated.length };
  }
};

module.exports = {
  createUser,
  getAllUsers,
  getUserById,
  getUserByLineId,
  updateUser,
  deleteUser,
  bulkCreateUsers,
};

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../config/db');

const USERS_FILE = path.join(__dirname, '..', 'users.json');
const JWT_SECRET = process.env.JWT_SECRET_KEY || process.env.JWT_SECRET || 'dev-secret';
const JWT_EXPIRES = process.env.ACCESS_TOKEN_EXPIRE_MINUTES || '10080';

function readUsers() {
    try {
        const raw = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(raw || '[]');
    } catch {
        return [];
    }
}

function writeUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function createToken(sub) {
    const expiresIn = parseInt(JWT_EXPIRES, 10) * 60; // minutes to seconds
    return jwt.sign({ sub }, JWT_SECRET, { expiresIn });
}

exports.register = async (req, res) => {
    const { email, password, name, username } = req.body;
    if (!email || !password || !name || !username) return res.status(400).json({ error: 'Missing required fields' });

    // Try to use MongoDB if available
    try {
        const db = getDb();
        const users = db.collection('users');

        // check for existing email or username
        const existing = await users.findOne({ $or: [{ email }, { username }] });
        if (existing) return res.status(400).json({ error: 'Email or username already registered' });

        const hashed = await bcrypt.hash(password, 10);
        const newUser = { email, password: hashed, name, username, createdAt: new Date() };
        const r = await users.insertOne(newUser);
        const id = r.insertedId.toString();
        const safeUser = { id, email, name, username };
        const token = createToken(id);
        return res.json({ user: safeUser, token });
    } catch (err) {
        // Fallback to file-based users
        const users = readUsers();
        if (users.find(u => u.email === email || u.username === username)) return res.status(400).json({ error: 'Email or username already registered' });
        const hashed = await bcrypt.hash(password, 10);
        const newUser = { id: Date.now().toString(), email, password: hashed, name, username };
        users.push(newUser);
        writeUsers(users);
        const safeUser = { id: newUser.id, email: newUser.email, name: newUser.name, username: newUser.username };
        const token = createToken(newUser.id);
        return res.json({ user: safeUser, token });
    }
};

exports.login = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });

    try {
        const db = getDb();
        const users = db.collection('users');
        const u = await users.findOne({ email });
        if (!u) return res.status(400).json({ error: 'Invalid credentials' });
        const ok = await bcrypt.compare(password, u.password);
        if (!ok) return res.status(400).json({ error: 'Invalid credentials' });
        const id = u._id.toString();
        const safeUser = { id, email: u.email, name: u.name, username: u.username };
        const token = createToken(id);
        return res.json({ user: safeUser, token });
    } catch (err) {
        // fallback to file
        const users = readUsers();
        const u = users.find(x => x.email === email);
        if (!u) return res.status(400).json({ error: 'Invalid credentials' });
        const ok = await bcrypt.compare(password, u.password);
        if (!ok) return res.status(400).json({ error: 'Invalid credentials' });
        const token = createToken(u.id);
        return res.json({ user: { id: u.id, email: u.email, name: u.name, username: u.username }, token });
    }
};

exports.lineCallback = async (req, res) => {
    // For now: receive the code and return a mock user.
    // In production exchange code with LINE's token endpoint and fetch profile.
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Missing code' });

    // Simple mocked user — you can replace with real LINE exchange
    const mockUser = { id: 'line-' + Date.now().toString(), email: 'lineuser@example.com', name: 'LINE User' };

    try {
        const db = getDb();
        const users = db.collection('users');
        // upsert by email
        const hashedPlaceholder = await bcrypt.hash('line-oauth', 8);
        const r = await users.findOneAndUpdate(
            { email: mockUser.email },
            { $setOnInsert: { email: mockUser.email, name: mockUser.name, username: mockUser.email.split('@')[0], password: hashedPlaceholder, createdAt: new Date() } },
            { upsert: true, returnDocument: 'after' }
        );
        const userDoc = r.value || r;
        const id = (userDoc._id && userDoc._id.toString()) || mockUser.id;
        const safeUser = { id, email: mockUser.email, name: mockUser.name };
        const token = createToken(id);
        return res.json({ user: safeUser, token });
    } catch (err) {
        // fallback to file-based users
        const users = readUsers();
        let u = users.find(x => x.email === mockUser.email);
        if (!u) {
            u = { id: mockUser.id, email: mockUser.email, name: mockUser.name };
            users.push(u);
            writeUsers(users);
        }
        const token = createToken(u.id);
        return res.json({ user: { id: u.id, email: u.email, name: u.name || mockUser.name }, token });
    }
};
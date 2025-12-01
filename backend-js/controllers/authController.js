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

exports.updateProfile = async (req, res) => {
    const { userId, displayName, username, email } = req.body;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    try {
        const db = getDb();
        const users = db.collection('users');

        // Check if new email/username already exists (excluding current user)
        if (email || username) {
            const existing = await users.findOne({
                $and: [
                    { _id: { $ne: new (require('mongodb').ObjectId)(userId) } },
                    { $or: [
                        email ? { email } : null,
                        username ? { username } : null
                    ].filter(Boolean) }
                ]
            });
            if (existing) return res.status(400).json({ error: 'Email or username already in use' });
        }

        const updateData = {};
        if (displayName) updateData.name = displayName;
        if (username) updateData.username = username;
        if (email) updateData.email = email;

        const r = await users.findOneAndUpdate(
            { _id: new (require('mongodb').ObjectId)(userId) },
            { $set: updateData },
            { returnDocument: 'after' }
        );

        if (!r.value) return res.status(404).json({ error: 'User not found' });

        const updatedUser = r.value;
        const safeUser = {
            id: updatedUser._id.toString(),
            userId: updatedUser._id.toString(),
            email: updatedUser.email,
            displayName: updatedUser.name,
            username: updatedUser.username,
            name: updatedUser.name
        };

        return res.json({ user: safeUser, message: 'Profile updated successfully' });
    } catch (err) {
        console.error('Error updating profile:', err);
        // Fallback to file-based users
        const users = readUsers();
        const userIndex = users.findIndex(u => u.id === userId);
        if (userIndex === -1) return res.status(404).json({ error: 'User not found' });

        // Check for duplicate email/username
        if (email || username) {
            const exists = users.some(u => u.id !== userId && (u.email === email || u.username === username));
            if (exists) return res.status(400).json({ error: 'Email or username already in use' });
        }

        if (displayName) users[userIndex].name = displayName;
        if (username) users[userIndex].username = username;
        if (email) users[userIndex].email = email;

        writeUsers(users);
        const updatedUser = users[userIndex];
        const safeUser = {
            id: updatedUser.id,
            userId: updatedUser.id,
            email: updatedUser.email,
            displayName: updatedUser.name,
            username: updatedUser.username,
            name: updatedUser.name
        };

        return res.json({ user: safeUser, message: 'Profile updated successfully' });
    }
};

exports.changePassword = async (req, res) => {
    const { userId, currentPassword, newPassword } = req.body;
    if (!userId || !currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        const db = getDb();
        const users = db.collection('users');
        const user = await users.findOne({ _id: new (require('mongodb').ObjectId)(userId) });

        if (!user) return res.status(404).json({ error: 'User not found' });

        // Verify current password
        const ok = await bcrypt.compare(currentPassword, user.password);
        if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

        // Hash and save new password
        const hashed = await bcrypt.hash(newPassword, 10);
        await users.updateOne(
            { _id: new (require('mongodb').ObjectId)(userId) },
            { $set: { password: hashed } }
        );

        return res.json({ message: 'Password changed successfully' });
    } catch (err) {
        console.error('Error changing password:', err);
        // Fallback to file-based users
        const users = readUsers();
        const userIndex = users.findIndex(u => u.id === userId);
        if (userIndex === -1) return res.status(404).json({ error: 'User not found' });

        const user = users[userIndex];
        // Verify current password
        const ok = await bcrypt.compare(currentPassword, user.password);
        if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

        // Hash and save new password
        const hashed = await bcrypt.hash(newPassword, 10);
        user.password = hashed;
        writeUsers(users);

        return res.json({ message: 'Password changed successfully' });
    }

exports.addPassword = async (req, res) => {
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword) {
        return res.status(400).json({ error: 'Missing userId or password' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    try {
        const db = getDb();
        const users = db.collection('users');
        const user = await users.findOne({ _id: new (require('mongodb').ObjectId)(userId) });

        if (!user) return res.status(404).json({ error: 'User not found' });

        // Check if user already has a password
        if (user.password) return res.status(400).json({ error: 'User already has a password' });

        // Hash and save new password
        const hashed = await bcrypt.hash(newPassword, 10);
        await users.updateOne(
            { _id: new (require('mongodb').ObjectId)(userId) },
            { $set: { password: hashed } }
        );

        return res.json({ message: 'Password added successfully' });
    } catch (err) {
        console.error('Error adding password:', err);
        // Fallback to file-based users
        const users = readUsers();
        const userIndex = users.findIndex(u => u.id === userId);
        if (userIndex === -1) return res.status(404).json({ error: 'User not found' });

        const user = users[userIndex];
        if (user.password) return res.status(400).json({ error: 'User already has a password' });

        const hashed = await bcrypt.hash(newPassword, 10);
        user.password = hashed;
        writeUsers(users);

        return res.json({ message: 'Password added successfully' });
    }

exports.getProfile = async (req, res) => {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const db = getDb();
        const users = db.collection('users');
        const ObjectId = require('mongodb').ObjectId;
        
        const user = await users.findOne({ _id: new ObjectId(userId) });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const safeUser = {
            id: user._id.toString(),
            userId: user._id.toString(),
            email: user.email,
            displayName: user.name,
            name: user.name,
            username: user.username,
            pictureUrl: user.pictureUrl || null,
            avatar: user.avatar || null
        };
        return res.json(safeUser);
    } catch (err) {
        console.error('Error fetching profile:', err);
        const users = readUsers();
        const user = users.find(u => u.id === userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const safeUser = {
            id: user.id,
            userId: user.id,
            email: user.email,
            displayName: user.name,
            name: user.name,
            username: user.username,
            pictureUrl: user.pictureUrl || null,
            avatar: user.avatar || null
        };
        return res.json(safeUser);
    }
};};



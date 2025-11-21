const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const USERS_FILE = path.join(__dirname, '..', 'users.json');

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

exports.register = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });

    const users = readUsers();
    if (users.find(u => u.email === email)) return res.status(400).json({ error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const newUser = { id: Date.now().toString(), email, password: hashed };
    users.push(newUser);
    writeUsers(users);

    const safeUser = { id: newUser.id, email: newUser.email };
    res.json({ user: safeUser });
};

exports.login = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });

    const users = readUsers();
    const u = users.find(x => x.email === email);
    if (!u) return res.status(400).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, u.password);
    if (!ok) return res.status(400).json({ error: 'Invalid credentials' });

    res.json({ user: { id: u.id, email: u.email } });
};

exports.lineCallback = async (req, res) => {
    // For now: receive the code and return a mock user.
    // In production exchange code with LINE's token endpoint and fetch profile.
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Missing code' });

    // Simple mocked user — you can replace with real LINE exchange
    const mockUser = { id: 'line-' + Date.now().toString(), email: 'lineuser@example.com', name: 'LINE User' };

    // Optionally persist LINE users:
    const users = readUsers();
    let u = users.find(x => x.email === mockUser.email);
    if (!u) {
        u = { id: mockUser.id, email: mockUser.email };
        users.push(u);
        writeUsers(users);
    }

    res.json({ user: { id: u.id, email: u.email, name: mockUser.name } });
};
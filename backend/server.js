const connectDB = require('./connect');
const express = require('express');
const cors = require('cors');
const postRoutes = require('./postRoutes');

const app = express();
const PORT = 5050;

app.use(cors());
app.use(express.json());

const startServer = async () => {
    await connectDB.connectToServer(); // <-- wait until connected
    app.use(postRoutes);               // <-- register routes after DB connected
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
};

startServer();

const fs = require('fs');
const path = require('path');

const deleteFile = (filePath) => {
    if (!filePath) return;

    // Convert URL path (/uploads/profiles/file.jpg) to actual System path
    // __dirname is the current directory; we go up to the root
    const absolutePath = path.join(__dirname, '..', filePath);

    if (fs.existsSync(absolutePath)) {
        fs.unlink(absolutePath, (err) => {
            if (err) {
                console.error("Failed to delete file:", err);
            } else {
                console.log("Successfully deleted old file:", absolutePath);
            }
        });
    }
};

module.exports = { deleteFile };
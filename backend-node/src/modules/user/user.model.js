/** user.model.js
 *  Model for User entries.
 *  Defines schema and data access methods.
 */

// Define Collections Name
const COLLECTION_NAME = "users";

// Define User Schema
const UserSchema = (data) => {
  return {
    lineid: data.lineid || "",
    email: data.email || "",
    password: data.password || "",
    name: data.name || "Unnamed",
    username: data.username || "anonymous",
    role: data.role || "user",
    createdAt: data.createdAt || new Date(),
    updatedAt: data.updatedAt || new Date(),
    preferences: data.preferences || {},
    avatar: data.avatar || null,
    lastLogin: data.lastLogin || new Date(),
    loginMethod: data.loginMethod || "mail",
    sentOption: data.sentOption || "mail",
    timezone: data.timezone || "Asia/Tokyo",
  };
};

// Exporting the schema and collection name
module.exports = {
  COLLECTION_NAME,
  UserSchema,
};

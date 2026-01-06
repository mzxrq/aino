/** user.service.js
 *  Service for managing users.
 */

const { getDb } = require("../../config/db"); // Assume a db module that provides DB connection
const { COLLECTION_NAME, UserSchema } = require("./user.model"); // Assume a model module that defines schema and collection name

const bcrypt = require("bcryptjs");

const { readFileSync, writeFileSync } = require("fs"); // File system module
const { join } = require("path"); // Path module for handling file paths

const USERS_FILE = join(__dirname, "..", "..", "cache", "users.json");
const { generateToken } = require("../../middleware/authMiddleware");

const crypto = require('crypto');
const { ObjectId } = require("mongodb");

const { deleteFile } = require('../../utils/fileHandler');
const { get } = require("http");

// File system module for reading/writing user data (if needed)
function readUser() {
  try {
    return JSON.parse(readFileSync(USERS_FILE, "utf8") || "[]");
  } catch {
    return [];
  }
}

function writeUser(users) {
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

const authenticateUser = async (email, password) => {
  const db = getDb();

  if (db) {
    // 1. Find user by email
    const user = await db.collection(COLLECTION_NAME).findOne({ email });

    // 2. Validate password (assume a simple comparison for illustration; use hashing in production)
    if (user) {
      // 1. Validate user
      const comparePassword = await bcrypt.compare(password, user.password);

      // 2. If valid, return user info
      if (!comparePassword) {
        throw new Error("Invalid email or password");
      }

      // 4. Generate JWT token
      const token = generateToken(user);

      // 5. Update last login time
      await db
        .collection(COLLECTION_NAME)
        .updateOne(
          { _id: user._id },
          { $set: { lastLogin: new Date(), loginMethod: "mail" } }
        );

      // 6. Return user info along with token
      return {
        token,
        user: {
          id: user._id,
          email: user.email,
          role: user.role,
        },
      };
    } else {
      throw new Error("Invalid email or password");
    }
  } else {
    // 1. Read users from file
    const users = readUser();
    const user = users.find((u) => u.email === email);

    // 2. Validate password (assume a simple comparison for illustration; use hashing in production)
    const comparePassword = await bcrypt.compare(password, user.password);

    // 3. If valid, return user info
    if (!comparePassword) {
      throw new Error("Invalid email or password");
    }

    // 4. Generate JWT token
    const token = generateToken(user);

    // 4. Return user info
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }
};

const registerUser = async (userData) => {
  const db = getDb();

  if (db) {
    // 1. Create user entry based on schema
    const userEntry = UserSchema(userData);

    // 2. Hash password if provided
    if (userEntry.password) {
      const salt = await bcrypt.genSalt(10);
      userEntry.password = await bcrypt.hash(userEntry.password, salt);
    }

    // 3. Insert new user into the database
    const result = await db.collection(COLLECTION_NAME).insertOne(userEntry);

    // 4. Return inserted user
    return { id: result.insertedId, ...userEntry };
  } else {
    // 1. Read existing users from file
    const existingUsers = readUser();

    // 2. Hash password if provided
    const fileUser = { ...userData };
    if (fileUser.password) {
      const salt = await bcrypt.genSalt(10);
      fileUser.password = await bcrypt.hash(fileUser.password, salt);
    }

    // 3. Append and write back to file
    const allUsers = existingUsers.concat(fileUser);
    writeUser(allUsers);

    // 4. Return inserted user
    return fileUser;
  }
};

const generateOtpService = async (email) => {
    const db = getDb();
    const users = db.collection('users');
    const user = await users.findOne({ email });

    if (!user) throw new Error('User not found');

    // Securely generate 6-digit code
    const otp = crypto.randomInt(100000, 999999).toString();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    await users.updateOne(
        { email },
        { $set: { resetOtp: otp, resetOtpExpires: expires } }
    );

    return otp;
};

const resetPasswordService = async (email, otp, newPassword) => {
    const db = getDb();
  const users = db.collection('users'); 
    
    const user = await users.findOne({
        email,
        resetOtp: otp,
        resetOtpExpires: { $gt: new Date() }
    });

    if (!user) throw new Error('Invalid or expired OTP');

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await users.updateOne(
        { email },
        { 
            $set: { password: hashedPassword },
            $unset: { resetOtp: "", resetOtpExpires: "" } 
        }
    );

    return { success: true };
};

const getProfile = async (userId) => {
    const db = getDb();

    if (db) {
        // 1. Find user by ID
        const user = await db
            .collection(COLLECTION_NAME)
            .findOne({ _id: typeof userId === "string" ? new ObjectId(userId) : userId });
        if (!user) {
            throw new Error("User not found");
        }
        return {user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          username: user.username,
          pictureUrl: user.pictureUrl || user.avatar || null,
          loginMethod: user.loginMethod,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin,
          timeZone: user.timeZone,
          role: user.role,
          setPassword: user.password ? true : false
        }};
    } else {
        // 1. Read users from file
        const users = readUser();
        const user = users.find((u) => u.id === userId);
        if (!user) {
            throw new Error("User not found");
        }
        return {user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          username: user.username,
          pictureUrl: user.pictureUrl || user.avatar || null,
          loginMethod: user.loginMethod,
          createdAt: user.createdAt,
          lastLogin: user.lastLogin,
          timeZone: user.timeZone,
          role: user.role
        }};
    }
};

const updateProfile = async (userId, updateData) => {
    const db = getDb();

    if (db) {
        // 1. Update user by ID
        await db
            .collection(COLLECTION_NAME)
            .updateOne(
                { _id: typeof userId === "string" ? new ObjectId(userId) : userId },
                { $set: { ...updateData, updatedAt: new Date() } }
            );
      // Return the updated user document so controllers can return the current user state
      return getUserById(userId);
    } else {
        // 1. Read users from file
        const users = readUser();

        const userIndex = users.findIndex((u) => u.id === userId);
        if (userIndex === -1) {
            throw new Error("User not found");
        }

        // 2. Update user data
        users[userIndex] = {
            ...users[userIndex],
            ...updateData,
            updatedAt: new Date(),
        };

        // 3. Write back to file
        writeUser(users);
    }
};

const deleteUser = async (userId) => {
  const db = getDb();

  if (db) {
    // 1. Delete user by ID
    await db
      .collection(COLLECTION_NAME)
      .deleteOne({ _id: typeof userId === "string" ? new ObjectId(userId) : userId });

      // Return success
      return true;
  } else {
    // 1. Read users from file
    const users = readUser();
    const filteredUsers = users.filter((u) => u.id !== userId);

    // 2. Write back to file
    writeUser(filteredUsers);

    // Return success
    return true;
  }
};

const changeUserPassword = async (userId, oldPassword, newPassword) => {
  const db = getDb();

  if (db) {
    // 1. Find user by ID
    const user = await db
      .collection(COLLECTION_NAME)
      .findOne({ _id: typeof userId === "string" ? new ObjectId(userId) : userId });
    if (!user) {
      throw new Error("User not found");
    }

    // DEBUG: Log user and passwords to verify values (remove in production)
      // console.log("User fetched:", user);


    // 2. Validate old password
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      throw new Error("Old password is incorrect");
    }

    // DEBUG: Log password match result (remove in production)
      // console.log("Password match result:", isMatch);


    // 3. Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // 4. Update password in database
    await db
      .collection(COLLECTION_NAME)
      .updateOne(
        { _id: user._id },
        { $set: { password: hashedPassword, updatedAt: new Date() } }
      );

      // Return success
      return true;

  } else {
    // 1. Read users from file
    const users = readUser();
    const userIndex = users.findIndex((u) => u.id === userId);

    if (userIndex === -1) {
      throw new Error("User not found");
    }

    // 2. Validate old password
    const isMatch = await bcrypt.compare(oldPassword, users[userIndex].password); 

    if (!isMatch) {
      throw new Error("Old password is incorrect");
    }

    // 3. Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // 4. Update password in file
    users[userIndex].password = hashedPassword;
    users[userIndex].updatedAt = new Date();
    writeUser(users);

    // Return success
    return true;
  }
};

const changePasswordForAdmin = async (userId, newPassword) => {
  const db = getDb();

  if (db) {
    // 1. Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // 2. Update password in database
    await db
      .collection(COLLECTION_NAME)
      .updateOne(
        { _id: typeof userId === "string" ? new ObjectId(userId) : userId },
        { $set: { password: hashedPassword, updatedAt: new Date() } }
      );

    // Return success
    return true;
  } else {
    // 1. Read users from file
    const users = readUser();
    const userIndex = users.findIndex((u) => u.id === userId);

    if (userIndex === -1) {
      throw new Error("User not found");
    }

    // 2. Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // 3. Update password in file
    users[userIndex].password = hashedPassword;
    users[userIndex].updatedAt = new Date();
    writeUser(users);

    // Return success
    return true;
  }
};

const addPassword = async (userId, password) => {
  const db = getDb();

  if (db) {
    // If have existed password
    const IsHasPassword = await db
      .collection(COLLECTION_NAME)
      .findOne({ _id: typeof userId === "string" ? new ObjectId(userId) : userId, password: { $exists: true, $ne: null } });
    
    // DEBUG: Log existence of password (remove in production)
      console.log("IsHasPassword:", IsHasPassword);

      if (IsHasPassword) return false;

    // 1. Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 2. Update password in database
    await db
      .collection(COLLECTION_NAME)
      .updateOne(
        { _id: typeof userId === "string" ? new ObjectId(userId) : userId },
        { $set: { password: hashedPassword, updatedAt: new Date() } }
      );

    // Return success
    return true;
  }
  else {
    // 1. Read users from file
    const users = readUser();
    const userIndex = users.findIndex((u) => u.id === userId);

    if (userIndex === -1) {
      throw new Error("User not found");

    }

    // 2. Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 3. Update password in file
    users[userIndex].password = hashedPassword;
    users[userIndex].updatedAt = new Date();
    writeUser(users);
    
    // Return success
    return true;
  }
};

const getPreferences  = async (userId) => {
  const db = getDb();

  if (db) {
    // 1. Find user by ID
    const user = await db
      .collection(COLLECTION_NAME)
      .findOne({ _id: typeof userId === "string" ? new ObjectId(userId) : userId });
    if (!user) {
      throw new Error("User not found");
    }
    return { preferences: user.preferences || {} };
  } else {
    // 1. Read users from file
    const users = readUser();
    const user = users.find((u) => u.id === userId);

    if (!user) {
      throw new Error("User not found");
    } 
    return { preferences: user.preferences || {} };

  }
};

const updatePreferences = async (userId, preferences) => {
  const db = getDb();
  if (db) {
    // 1. Update user preferences by ID
    await db
      .collection(COLLECTION_NAME)
      .updateOne(
        { _id: typeof userId === "string" ? new ObjectId(userId) : userId },
        { $set: { preferences, updatedAt: new Date() } }
      );
  }
  else {
    // 1. Read users from file
    const users = readUser();
    const userIndex = users.findIndex((u) => u.id === userId);
    if (userIndex === -1) {
      throw new Error("User not found");
    }
    // 2. Update preferences
    users[userIndex].preferences = preferences;
    users[userIndex].updatedAt = new Date();

    // 3. Write back to file
    writeUser(users);
  }
}

const updateAvatar = async (userId, avatarUrl) => {
  const db = getDb();

  if (db) {
    const users = db.collection(COLLECTION_NAME);
    const query = { _id: typeof userId === "string" ? new ObjectId(userId) : userId };

    // 1. Find user to get the OLD avatar path
    const user = await users.findOne(query);

    // 2. If user has an old avatar, delete it from the folder
    if (user && user.avatar) {
        deleteFile(user.avatar);
    }

    // 3. Update the database with the NEW path
    await users.updateOne(query, { 
        $set: { avatar: avatarUrl, updatedAt: new Date() } 
    });

    return avatarUrl;
  } else {
    // 1. Read users from file
    const users = readUser();

    const userIndex = users.findIndex((u) => u.id === userId);

    if (userIndex === -1) {
      throw new Error("User not found");
    }

    // 2. If user has an old avatar, delete it from the folder
    deleteFile(users[userIndex].avatar);

    // 3. Update avatar URL
    users[userIndex].avatar = avatarUrl;
    users[userIndex].updatedAt = new Date();

    // 4. Write back to file
    writeUser(users);

    return avatarUrl;
  }


};

const deleteAvatar = async (userId) => {
  const db = getDb();

  if (db) {
    const users = db.collection(COLLECTION_NAME);
    const query = { _id: typeof userId === "string" ? new ObjectId(userId) : userId };

    // 1. Find user to get the OLD avatar path
    const user = await users.findOne(query);
    // 2. If user has an old avatar, delete it from the folder
    if (user && user.avatar) {
        deleteFile(user.avatar);
    }

    // 3. Remove user avatar by ID
    await users.updateOne(
        query,
        { $unset: { avatar: "" }, $set: { updatedAt: new Date() } }
    );
  } else {
    // 1. Read users from file
    const users = readUser();

    const userIndex = users.findIndex((u) => u.id === userId);

    if (userIndex === -1) {
      throw new Error("User not found");
    }

    // 1. If user has an old avatar, delete it from the folder
    deleteFile(users[userIndex].avatar);

    // 2. Remove avatar URL
    delete users[userIndex].avatar;
    users[userIndex].updatedAt = new Date();

    // 3. Write back to file
    writeUser(users);
  }
};

const getAllUsers = async () => {
  const db = getDb();

  if (db) {
    // 1. Retrieve all users from the database
    const users = await db.collection(COLLECTION_NAME).find({}).toArray();
    // 2. Return the users
    return users.map(user => ({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      IsHasPassword: !!user.password,
    }));
  }
  else {
    // 1. Read users from file
    const users = readUser();
    // 2. Return the users
    return users.map(user => ({
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      IsHasPassword: !!user.password,
    }));
  }
};

const createUser = async (userData) => {
  return await registerUser(userData);
};

const getUserById = async (userId) => {
  const db = getDb();

  if (db) {
    // 1. Find user by ID
    const user = await db
      .collection(COLLECTION_NAME)
      .findOne({ _id: typeof userId === "string" ? new ObjectId(userId) : userId });

    if (!user) {
      throw new Error("User not found");
    }
    return user;
  } else {
    // 1. Read users from file
    const users = readUser();
    const user = users.find((u) => u.id === userId);

    if (!user) {
      throw new Error("User not found");
    }

    return user;
  }
};

const updateUser = async (userId, updateData) => {
  const db = getDb();

  if (db) {
    // 1. Update user by ID
    await db  
      .collection(COLLECTION_NAME)
      .updateOne(
        { _id: typeof userId === "string" ? new ObjectId(userId) : userId },
        { $set: { ...updateData, updatedAt: new Date() } }
      );
    
      // Return updated user
      return getUserById(userId);
  }
  else {
    // 1. Read users from file
    const users = readUser();
    const userIndex = users.findIndex((u) => u.id === userId);
    if (userIndex === -1) {
      throw new Error("User not found");
    }

    // 2. Update user data
    users[userIndex] = {
      ...users[userIndex],
      ...updateData,
      updatedAt: new Date(),
    };

    // 3. Write back to file
    writeUser(users);

    // Return updated user
    return users[userIndex];
  }
};


// Exporting service methods
module.exports = {
  authenticateUser,
  registerUser,
  generateOtpService,
  resetPasswordService,
  getProfile,
  updateProfile,
  deleteUser,
  changeUserPassword,
  changePasswordForAdmin,
  addPassword,
  getPreferences,
  updatePreferences,
  updateAvatar,
  deleteAvatar,
  getAllUsers,
  createUser,
  getUserById,
  updateUser,
};
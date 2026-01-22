/** user.controller.js
 *  Controller for handling user related requests.
 *  Uses UserService to perform operations.
 */
const UserService = require("./user.service");
const nodemailerService = require("../nodemailer/nodemailer.service");

const loginUser = async (req, res) => {
  try {
    // 1. Get email and password from request body
    const { email, password } = req.body;

    // 2. Authenticate user via service
    const user = await UserService.authenticateUser(email, password);

    // 3. Check if authentication was successful
    if (!user) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid credentials." });
    }

    // 4. Respond with user data
    return res.status(200).json({ success: true, data: user });
  } catch (err) {
    console.error("Login Error:", err);
    return res.status(500).json({ success: false, error: "Failed to login." });
  }
};

const registerUser = async (req, res) => {
  try {
    // 1. Get user data from request body
    const userData = req.body;

    // 2. Register user via service
    const newUser = await UserService.registerUser(userData);

    // 3. Respond with created user
    return res.status(201).json({ success: true, data: newUser });
  } catch (err) {
    console.error("Registration Error:", err);
    const status = err.statusCode || (err.message?.includes("exists") ? 409 : 500);
    return res
      .status(status)
      .json({ success: false, error: err.message || "Failed to register user." });
  }
};

const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const otp = await UserService.generateOtpService(email);

        await nodemailerService.sendOtpEmail(email, otp);
        
        // Log for testing (In production, use an email service here)
        // console.log(`[Email Sent to ${email}]: Your OTP is ${otp}`);

        res.status(200).json({ success: true, message: "OTP sent to email" });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

const resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        await UserService.resetPasswordService(email, otp, newPassword);

        res.status(200).json({ success: true, message: "Password updated successfully" });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

const deleteUserProfile = async (req, res) => {
  try {
    // 1. Get user ID from request (set by authMiddleware)
    const userId = req.userId;

    // 2. Delete user via service
    await UserService.deleteUser(userId);
    // 3. Respond with success message
    return res
      .status(200)
      .json({ success: true, message: "User deleted successfully." });
  } catch (err) {
    console.error("Delete User Error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to delete user." });
  }
};


const getUserProfile = async (req, res) => {
  try {
    // 1. Get user ID from request (set by authMiddleware)
    const userId = req.userId;

    // 2. Retrieve user profile via service
    const profile = await UserService.getProfile(userId);

    // 3. Respond with user profile
    return res.status(200).json({ success: true, data: profile });
  } catch (err) {
    console.error("Get Profile Error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to retrieve profile." });
  }
};

const updateUserProfile = async (req, res) => {
  try {
    // 1. Get user ID from request (set by authMiddleware)
    const userId = req.userId;
    const profileData = req.body;

    // 2. Update user profile via service
    const updatedProfile = await UserService.updateProfile(userId, profileData);

    // 3. Respond with updated profile
    return res.status(200).json({ success: true, data: updatedProfile });
  } catch (err) {
    console.error("Update Profile Error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to update profile." });
  }
};


const changePassword = async (req, res) => {
  try {
    // DEBUG: See exactly what the server is receiving
      // console.log("Headers:", req.headers['content-type']);
      // console.log("Body:", req.body);

    // 1. Get user ID from request (set by authMiddleware)
    const userId = req.userId;
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        error: "Both old and new passwords are required." 
      });
    }

    // 2. Change password via service
    const changed = await UserService.changeUserPassword(
      userId,
      oldPassword,
      newPassword
    );

    // DEBUG : See result of change attempt
      // console.log("Password Change Result:", changed);

    // 3. Check if password was changed
    if (!changed) {
      return res
        .status(400)
        .json({ success: false, error: "Old password is incorrect." });
    }

    // 4. Respond with success message
    return res
      .status(200)
      .json({ success: true, message: "Password changed successfully." });
  } catch (err) {
    console.error("Change Password Error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to change password." });
  }
};

const changePasswordForAdmin = async (req, res) => {
  try {
    // 1. Get user ID from params and new password from body
    const userId = req.params.id;
    const { newPassword } = req.body;

    // 2. Change password via service
    const changed = await UserService.changePasswordForAdmin(
      userId,
      newPassword
    );

    // 3. Check if password was changed
    if (!changed) {
      return res.status(404).json({ success: false, error: "User not found." });
    }

    // 4. Respond with success message
    return res
      .status(200)
      .json({ success: true, message: "Password changed successfully." });
  } catch (err) {
    console.error("Change Password Error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to change password." });
  }
};

const addPassword = async (req, res) => {
  try {
    // 1. Get user ID from request (set by authMiddleware)
    const userId = req.userId;
    const { newPassword } = req.body;

    // 2. Add password via service
    const added = await UserService.addPassword(userId, newPassword);

    // 3. Check if password was added
    if (!added) {
      return res
        .status(400)
        .json({ success: false, error: "Password already exists." });
    }

    // 4. Respond with success message
    return res
      .status(200)
      .json({ success: true, message: "Password added successfully." });
  } catch (err) {
    console.error("Add Password Error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to add password." });
  }
};

const getUserPreferences = async (req, res) => {
  try {
    // 1. Get user ID from request (set by authMiddleware)
    const userId = req.userId;

    // 2. Retrieve user preferences via service
    const preferences = await UserService.getPreferences(userId);

    // 3. Respond with user preferences
    return res.status(200).json({ success: true, data: preferences });
  } catch (err) {
    console.error("Get Preferences Error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to retrieve preferences." });
  }
};

const updateUserPreferences = async (req, res) => {
  try {
    // 1. Get user ID from request (set by authMiddleware)
    const userId = req.userId;
    const preferencesData = req.body;

    // 2. Update user preferences via service
    const updatedPreferences = await UserService.updatePreferences(
      userId,
      preferencesData
    );

    // 3. Respond with updated preferences
    return res.status(200).json({ success: true, data: updatedPreferences });
  } catch (err) {
    console.error("Update Preferences Error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to update preferences." });
  }
};

const updateAvatar = async (req, res) => {
  try {
    // 1. Get user ID from request (set by authMiddleware)
    const userId = req.userId;
    const avatarFile = req.file; 

    // 2. Validate file was uploaded
    if (!avatarFile) {
      return res.status(400).json({ success: false, error: "No file uploaded. Please select an image file." });
    }

    // Format path for web (replace backslashes for Windows)
    const filePath = `/${avatarFile.path.replace(/\\/g, '/')}`;

    // 3. Update user avatar via service
    const updatedAvatar = await UserService.updateAvatar(userId, filePath);

    // 4. Respond with updated avatar info
    return res.status(200).json({ success: true, data: updatedAvatar });
  } catch (err) {
    console.error("Update Avatar Error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to update avatar." });
  }
};

const deleteAvatar = async (req, res) => {
  try {
    // 1. Get user ID from request (set by authMiddleware)
    const userId = req.userId;

    // 2. Delete user avatar via service
    await UserService.deleteAvatar(userId);

    // 3. Respond with success message
    return res
      .status(200)
      .json({ success: true, message: "Avatar deleted successfully." });
  } catch (err) {
    console.error("Delete Avatar Error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to delete avatar." });
  }
};




/**
 *  CRUD Operations for Users
 */
const createUser = async (req, res) => {
  try {
    // 1. Get user data from request body
    const userData = req.body;

    // 2. Create user via service
    const newUser = await UserService.createUser(userData);

    // 3. Respond with created user
    return res.status(201).json({ success: true, data: newUser });
  } catch (err) {
    console.error("Create User Error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to create user." });
  }
};

const getAllUsers = async (req, res) => {
  try {
    // 1. Get all users from service
    const users = await UserService.getAllUsers();

    // 2. Respond with users data
    return res.status(200).json({ success: true, data: users });
  } catch (err) {
    console.error("Get All Users Error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to retrieve users." });
  }
};

const getUserById = async (req, res) => {
  try {
    // 1. Get user ID from request params
    const userId = req.params.id;
    const user = await UserService.getUserById(userId);

    // 2. Check if user exists
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found." });
    }

    // 3. Respond with user data
    return res.status(200).json({ success: true, data: user });
  } catch (err) {
    console.error("Get User Error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to retrieve user." });
  }
};

const updateUser = async (req, res) => {
  try {
    // 1. Get user ID from request params and data from body
    const userId = req.params.id;
    const updateData = req.body;

    // 2. Update user via service
    const updatedUser = await UserService.updateUser(userId, updateData);

    //  Debug: Log the updated user
      // console.log("Updated User:", updatedUser);

    // 3. Check if user was found and updated
    if (!updatedUser) {
      return res.status(404).json({ success: false, error: "User not found." });
    }

    // 4. Respond with updated user data
    return res.status(200).json({ success: true, data: updatedUser });
  } catch (err) {
    console.error("Update User Error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to update user." });
  }
};
const deleteUserForAdmin = async (req, res) => {
  try {
    // 1. Get user ID from request params
    const userId = req.params.id;

    // 2. Delete user via service
    const deleted = await UserService.deleteUser(userId);

    // 3. Check if user was found and deleted
    if (!deleted) {
      return res.status(404).json({ success: false, error: "User not found." });
    }

    // 4. Respond with success message
    return res
      .status(200)
      .json({ success: true, message: "User deleted successfully." });
  } catch (err) {
    console.error("Delete User Error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to delete user." });
  }
};



module.exports = {
  loginUser,
  registerUser,
  forgotPassword,
  resetPassword,
  getUserProfile,
  updateUserProfile,
  deleteUserProfile,
  changePassword,
  addPassword,
  getUserPreferences,
  updateUserPreferences,
  updateAvatar,
  deleteAvatar,
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUserForAdmin,
  changePasswordForAdmin,
};

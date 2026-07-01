import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { createUser, findUserByEmail, findUserById, deleteUser, updateUser } from "../models/authModel.js";

const PUBLIC_REGISTRATION_ROLE = "COMMUNITY MEMBER";

const sendServerError = (res, message, error) => {
  console.error(message, error);
  return res.status(500).json({ message: "Server error", detail: error.message });
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    ngoId: user.ngoId,
  };
}

export const register = async (req, res) => {
  try {
    const {
      email,
      password,
      fullName,
      role,
      ngoId,
      ngo_id: legacyNgoId,
    } = req.body ?? {};
    const normalizedEmail = email?.trim().toLowerCase();
    const normalizedName = fullName?.trim();
    const uppercaseRole =
      String(role).trim().toUpperCase() || PUBLIC_REGISTRATION_ROLE;

    if (!normalizedEmail || !normalizedName || !password) {
      return res
        .status(400)
        .json({ message: "Email, password, and fullName are required" });
    }
    if (password.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters" });
    }

    const existingUser = await findUserByEmail(normalizedEmail);
    if (existingUser) {
      return res.status(409).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await createUser({
      email: normalizedEmail,
      passwordHash: hashedPassword,
      fullName: normalizedName,
      role: uppercaseRole,
      ngoId: ngoId ?? legacyNgoId ?? null,
    });

    return res.status(201).json({
      message: "User registered successfully",
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Register Error:", error.message);
    return res.status(500).json({ message: "Server error", detail: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const user = await findUserByEmail(normalizedEmail);
    const isMatch =
      user?.passwordHash && (await bcrypt.compare(password, user.passwordHash));
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not configured");
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    return res.json({
      message: "Login successful",
      token,
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const updateVillageLeaders = async (req, res) => {
  try{
    const { fullName, email, password, districtId, phoneNumber } = req.body ?? {};
    const leaderId = req.user?.id;
    
    if (!fullName || !email || !districtId) {
      return res.status(400).json({ message: "fullName, email, and districtId are required" });
    }
    
    const user = await findUserByEmail(email.trim().toLowerCase());
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    const updatedData = {
      fullName: fullName.trim(),
      districtId,
      phoneNumber: phoneNumber?.trim() || null,
    };
    
    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }
      updatedData.passwordHash = await bcrypt.hash(password, 10);
    }
    
    const updatedUser = await updateUser(user.id, updatedData);
    
    return res.json({
      message: "Village leader updated successfully",
      user: publicUser(updatedUser),
    });
  } catch (error) {
    return sendServerError(res, "PUT /users/village-leaders error:", error);
  }
}

export const saveVillageLeader = async (req, res) => {
  try {
    const { fullName, email, password, districtId, phoneNumber } = req.body ?? {};
    if (!fullName || !email || !districtId || !password) {
      return res.status(400).json({ message: "fullName, email, districtId, and password are required" });
    }

    const existingUser = await findUserByEmail(email.trim().toLowerCase());
    if (existingUser) {
      return res.status(409).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await createUser({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      passwordHash: hashedPassword,
      role: "VILLAGE LEADER",
      districtId,
      phoneNumber: phoneNumber?.trim() || null,
    });

    return res.status(201).json({
      message: "Village leader created successfully",
      user: publicUser(newUser),
    });
  } catch (error) {
    return sendServerError(res, "POST /users/village-leaders error:", error);
  }
}

export const deleteVillageLeader = async (req, res) => {
  try {
    const {id} = req.params;
    if (!id) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const user = await findUserById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await deleteUser(id);
    return res.json({ message: "Village leader deleted successfully" });
  } catch (error) {
    return sendServerError(res, "DELETE /users/village-leaders error:", error);
  }
}

export default {
  register,
  login,
  updateVillageLeaders
};

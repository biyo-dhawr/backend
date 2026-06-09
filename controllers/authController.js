import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { createUser, findUserByEmail } from "../models/authModel.js";

const PUBLIC_REGISTRATION_ROLE = "COMMUNITY MEMBER";

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
    console.error("Register Error:", error);
    return res.status(500).json({ message: "Server error" });
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

export default {
  register,
  login,
};

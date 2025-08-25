import bcrypt from 'bcryptjs';
import { logger } from '../config/logger.js';
// Salt rounds for bcrypt (higher = more secure but slower)
const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12');
const defaultPasswordRequirements = {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
};
// Hash a password
export const hashPassword = async (password) => {
    try {
        const salt = await bcrypt.genSalt(SALT_ROUNDS);
        const hashedPassword = await bcrypt.hash(password, salt);
        logger.info('Password hashed successfully');
        return hashedPassword;
    }
    catch (error) {
        logger.error('Error hashing password:', error);
        throw new Error('Failed to hash password');
    }
};
// Compare password with hash
export const comparePassword = async (password, hashedPassword) => {
    try {
        const isMatch = await bcrypt.compare(password, hashedPassword);
        logger.info(`Password comparison result: ${isMatch ? 'match' : 'no match'}`);
        return isMatch;
    }
    catch (error) {
        logger.error('Error comparing password:', error);
        throw new Error('Failed to compare password');
    }
};
// Validate password against requirements
export const validatePassword = (password, requirements = defaultPasswordRequirements) => {
    const errors = [];
    // Check minimum length
    if (password.length < requirements.minLength) {
        errors.push(`Password must be at least ${requirements.minLength} characters long`);
    }
    // Check uppercase requirement
    if (requirements.requireUppercase && !/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }
    // Check lowercase requirement
    if (requirements.requireLowercase && !/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }
    // Check numbers requirement
    if (requirements.requireNumbers && !/\d/.test(password)) {
        errors.push('Password must contain at least one number');
    }
    // Check special characters requirement
    if (requirements.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>?]/.test(password)) {
        errors.push('Password must contain at least one special character');
    }
    // Check for common weak passwords
    const commonPasswords = [
        'password', '123456', '123456789', 'qwerty', 'abc123',
        'password123', 'admin', 'letmein', 'welcome', 'monkey'
    ];
    if (commonPasswords.includes(password.toLowerCase())) {
        errors.push('Password is too common and easily guessable');
    }
    return {
        isValid: errors.length === 0,
        errors,
    };
};
// Generate a secure random password
export const generateSecurePassword = (length = 16) => {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const allChars = uppercase + lowercase + numbers + specialChars;
    let password = '';
    // Ensure at least one character from each category
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += specialChars[Math.floor(Math.random() * specialChars.length)];
    // Fill the rest randomly
    for (let i = 4; i < length; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
    }
    // Shuffle the password to avoid predictable patterns
    return password.split('').sort(() => Math.random() - 0.5).join('');
};
// Check if password has been compromised (basic implementation)
export const isPasswordCompromised = async (password) => {
    // In a real application, you might check against a database of compromised passwords
    // or use a service like HaveIBeenPwned API
    // For now, just check against a basic list
    const compromisedPasswords = [
        'password', '123456', '123456789', 'qwerty', 'abc123',
        'password123', 'admin', 'letmein', 'welcome', 'monkey',
        '12345678', 'iloveyou', 'princess', 'dragon', '123123'
    ];
    return compromisedPasswords.includes(password.toLowerCase());
};
// Calculate password strength score (0-100)
export const calculatePasswordStrength = (password) => {
    let score = 0;
    // Length bonus
    if (password.length >= 8)
        score += 20;
    if (password.length >= 12)
        score += 10;
    if (password.length >= 16)
        score += 10;
    // Character variety bonus
    if (/[a-z]/.test(password))
        score += 10;
    if (/[A-Z]/.test(password))
        score += 10;
    if (/\d/.test(password))
        score += 10;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>?]/.test(password))
        score += 15;
    // Pattern penalties
    if (/(.)\1{2,}/.test(password))
        score -= 10; // Repeated characters
    if (/123|abc|qwe/i.test(password))
        score -= 10; // Sequential patterns
    // Ensure score is between 0 and 100
    return Math.max(0, Math.min(100, score));
};
export default {
    hashPassword,
    comparePassword,
    validatePassword,
    generateSecurePassword,
    isPasswordCompromised,
    calculatePasswordStrength,
};
//# sourceMappingURL=password.js.map
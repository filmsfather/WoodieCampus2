export interface PasswordRequirements {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
}
export declare const hashPassword: (password: string) => Promise<string>;
export declare const comparePassword: (password: string, hashedPassword: string) => Promise<boolean>;
export declare const validatePassword: (password: string, requirements?: PasswordRequirements) => {
    isValid: boolean;
    errors: string[];
};
export declare const generateSecurePassword: (length?: number) => string;
export declare const isPasswordCompromised: (password: string) => Promise<boolean>;
export declare const calculatePasswordStrength: (password: string) => number;
declare const _default: {
    hashPassword: (password: string) => Promise<string>;
    comparePassword: (password: string, hashedPassword: string) => Promise<boolean>;
    validatePassword: (password: string, requirements?: PasswordRequirements) => {
        isValid: boolean;
        errors: string[];
    };
    generateSecurePassword: (length?: number) => string;
    isPasswordCompromised: (password: string) => Promise<boolean>;
    calculatePasswordStrength: (password: string) => number;
};
export default _default;

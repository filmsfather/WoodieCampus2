import { Request, Response, NextFunction } from 'express';
export declare const corsOptions: {
    origin: (origin: string | undefined, callback: (error: Error | null, success?: boolean) => void) => void;
    credentials: boolean;
    optionsSuccessStatus: number;
    methods: string[];
    allowedHeaders: string[];
    exposedHeaders: string[];
};
export declare const helmetOptions: {
    contentSecurityPolicy: {
        directives: {
            defaultSrc: string[];
            scriptSrc: string[];
            styleSrc: string[];
            fontSrc: string[];
            imgSrc: string[];
            connectSrc: string[];
            mediaSrc: string[];
            objectSrc: string[];
            childSrc: string[];
            workerSrc: string[];
            upgradeInsecureRequests: never[] | null;
        };
    };
    crossOriginEmbedderPolicy: boolean;
    hsts: {
        maxAge: number;
        includeSubDomains: boolean;
        preload: boolean;
    };
};
export declare const generalRateLimit: import("express-rate-limit").RateLimitRequestHandler;
export declare const authRateLimit: import("express-rate-limit").RateLimitRequestHandler;
export declare const passwordResetRateLimit: import("express-rate-limit").RateLimitRequestHandler;
export declare const apiRateLimit: import("express-rate-limit").RateLimitRequestHandler;
export declare const requestSizeLimit: (limit?: string) => (req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
export declare const ipWhitelist: (allowedIps: string[]) => (req: Request, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare const requestLogger: (req: Request, res: Response, next: NextFunction) => void;
export declare const securityHeaders: (req: Request, res: Response, next: NextFunction) => void;
export declare const securityErrorHandler: (error: any, req: Request, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;

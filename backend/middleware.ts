import type { Request, Response, NextFunction } from "express";
interface AuthRequest extends Request {
  userId?: string;
}

const JWT_SECRET = process.env.JWT_SECRET!;

import jwt from "jsonwebtoken";

export function authMiddleware(
    req : AuthRequest,
    res : Response,
    next : NextFunction
){
    const authheader = req.headers.authorization;

    if(!authheader || !authheader.startsWith('Bearer ')){
       return res.status(401).json({
            message : "invalid headers"
        });
    }

    const token = authheader.slice(7);
    try{
         const decoded = jwt.verify(token , JWT_SECRET) as {
        userId : string
        };

        req.userId = decoded.userId
        next();
    }   
    catch{
        return res.status(401).json({
            message : "invalid token"
        })
    }
}
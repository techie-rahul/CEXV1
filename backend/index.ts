import express from "express";
import type { Request, Response } from "express";
import { Assets, PrismaClient, Side, Type } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import zod from "zod";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt"
import {authMiddleware} from "./middleware"
import { use } from "react";

const app = express();

const JWT_SECRET = process.env.JWT_SECRET!;

app.use(express.json())

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!
});

const prisma = new PrismaClient({
  adapter
});

const signupSchema = zod.object({
    username : zod.string().min(3),
    password : zod.string().min(3)
});

const signinSchema = zod.object({
    username : zod.string(),
    password : zod.string()
});


app.post("/signup" , async (req , res)=>{
    const parsed = signupSchema.safeParse(req.body);
    if(!parsed.success){
        res.status(403).json({
            error:parsed.error.issues
        })
        return;
    }
    const {username , password} = parsed.data;
    const existing = await prisma.user.findFirst({
        where:{
            username
        }
    })
    if(existing){
        res.status(403).json({
            message : "username already taken"
        })
        return;
    }
    const hashedPassword = await bcrypt.hash(password , 10);

    const user = await prisma.user.create({
        data:{
            username,
            password : hashedPassword
            
        }
    })
    const balances = [
        {
            userId : user.id,
            asset : Assets.INR,
            available : 10000,
            locked : 0
        },{
            userId :  user.id,
            asset : Assets.AXIS,
            available : 0,
            locked : 0
        },{
            userId :  user.id,
            asset : Assets.HDFC,
            available : 0,
            locked : 0
        },{
            userId :  user.id,
            asset : Assets.TATA,
            available : 0,
            locked : 0
        }
    ]
    
    await prisma.balance.createMany({
        data:balances
    })
    res.json({
        userId : user.id
    })
})


app.post("/signin" , async ( req, res)=>{
    const parsed = signinSchema.safeParse(req.body);

    if(!parsed.success){
        res.status(403).json({
            error:parsed.error.issues
        })
        return;
    }
    const {username , password } = parsed.data; 
    const user = await prisma.user.findFirst({
        where:{
            username : username
        }
    })
    if(!user){
        res.status(403).json({
            message : "Invalid credentials"
        })
        return;
    }
    const valid = await bcrypt.compare(password , user.password);

    if(!valid){
        res.status(403).json({
            message : "invalid password"
        })
        return;
    }
    
    const token  = jwt.sign({
        userId : user.id
    },JWT_SECRET);

    res.json({
        userId : user.id,
        token : token
    })
})

app.get("/balance" , authMiddleware , async (req , res)=>{
    const userId = req.userId;
    if(!userId){
        return res.status(403).json({
            message : "unauthorized user"
        })
    }
    const balance = await prisma.balance.findMany({
        where:{
           userId : userId
        }
    })
    res.json({
        balance
    })
})

app.get("/stocks" , async (req , res)=>{
    const stocks = await prisma.stock.findMany();
    return res.json(stocks);
})

app.listen(3000);
import express from "express";
import type { Request, Response } from "express";
import { Assets, PrismaClient, Side, Status, Type } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import zod from "zod";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt"
import {authMiddleware} from "./middleware"
import { use } from "react";
import { id } from "zod/locales";

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

const oderSchema = zod.object({
    stockId : zod.string(),
    side: zod.nativeEnum(Side),
    type : zod.nativeEnum(Type),
    price : zod.number().positive(),
    quantity : zod.number().positive()
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
});


app.post("/order" , authMiddleware , async(req , res )=>{
    const userId = req.userId;

    if(!userId){
        return res.status(401).json({
            message : "unthauthorized user"
        })
    };

    const parsed = oderSchema.safeParse(req.body);
    if(!parsed.success){
        return res.status(401).json({
            error:parsed.error.issues
        })
    };

    const {stockId , side , type , price ,  quantity }  = parsed.data

    const stock = await prisma.stock.findUnique({
        where:{
            id : stockId
        }
    });

    if(!stock){
        return res.status(401).json({
            message : "stock not found"
        })
    }

    let balanceUpdate;
   
    if(side == Side.BUY){

    const requiredAmount = price * quantity;

    const amount = await prisma.balance.findFirst({
        where:{
            userId,
            asset:Assets.INR
        },
        select:{
            available:true,
            locked:true
        }
        
    });

    if(!amount){
        return res.status(401).json({
            message : "no amount"
        })
    }

    // console.log(amount.available);
    // console.log(typeof amount.available);

    const availableAmount = Number(amount.available);

    if(requiredAmount > availableAmount){
        return res.status(401).json({
            message : "insufficient balance"
        })
    };

    const newLocked = Number(amount.locked)+ requiredAmount;

    balanceUpdate =   prisma.balance.update({
        where: {
            userId_asset:{
                userId,
                asset : Assets.INR
            }
        },
        data:{
            available : availableAmount - requiredAmount,
            locked : newLocked
        }
    });

 }

 else{

    const asset = stock.symbol as Assets;

    const balance = await prisma.balance.findFirst({
        where:{
            userId,
            asset
        }
    })

    if(!balance){
        return res.status(404).json({
            message : "stock balance not found"
        })
    }

    const availableShares = Number(balance.available);

    if(quantity > availableShares){
        return res.status(400).json({
            message : "insufficient stock balance"
        })
    };

     balanceUpdate =  prisma.balance.update({
        where:{
            userId_asset:{
                userId,
                asset
            }
        },
        data:{
          available : availableShares - quantity,
          locked : Number(balance?.locked) + quantity
        }
    });

}

    const [updateBalance , createdOrder] = await prisma.$transaction([
        balanceUpdate , 
        prisma.order.create({
            data:{
                userId,
                stockId,
                side,
                type,
                price,
                quantity,
                filledQuantity : 0,
                status : Status.OPEN
            }
        })
    ]);

    return res.json({
        orderId : createdOrder.id,
        updateBalance,
        message : "order created successfully"
    });


})

app.get("/orders" , authMiddleware , async (req , res)=>{
    const userId = req.userId;
    
    if(!userId){
        return res.status(401).json({
            message : "unauthorized user"
        })
    };

    const orders = await prisma.order.findMany({
        where:{
            userId
        },
        orderBy:{
            createdAt:"desc"
        }
    })

    return res.json({
        orders
    })
});

app.delete("/order/:orderId" , authMiddleware , async (req , res)=>{

    const userId = req.userId;
    const orderId  = req.params.orderId

    if(!userId){
        return res.json({
            message : "unauthorized user"
        })
    };

    const order = await prisma.order.findFirst({
        where : {
            userId,
            id : orderId
        }
    });

    if(!order){
        return res.status(401).json({
            message : "no oder found"
        })
    };

    if(
        order.status != Status.OPEN && 
        order.status != Status.PARTIALLY_FILLED
    ) {
        return res.status(401).json({
            message : "order can't be cancelled"
        })
    }

    const amountToUnlock = Number(order.price) * ( Number(order.quantity) - Number(order.filledQuantity) );
    
    const balance = await prisma.balance.findFirst({
        where:{
            userId ,
            asset : Assets.INR
        }
    });

    if(!balance){
        return res.status(401).json({
            message : "balance not found"
        })
    }

    const updatedBalance = await prisma.balance.update({
        where:{
            userId_asset:{
                userId ,
                asset : Assets.INR
            } 
        },
        data:{
            available : Number(balance.available) + amountToUnlock,
            locked : Number(balance.locked) - amountToUnlock
        }
    });

    const cancelledOrder  = await prisma.order.update({
        where:{
            id : orderId
        },
        data:{
            status : Status.CANCELLED 
        }
    })

    return res.json({
        updatedBalance,
        cancelledOrder
    });

})

app.listen(3000);
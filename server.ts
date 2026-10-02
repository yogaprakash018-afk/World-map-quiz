import express, { type Express, type Request, type Response, type NextFunction } from "express";
import mysql,  { type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';
import { randomBytes } from "crypto";
import cookieParser from "cookie-parser";
import bcrypt from 'bcrypt';
import 'dotenv/config';

interface Details {
    username : string,
    password : string,
}; 

interface User extends RowDataPacket{
    id : number,
    email : string,
    password : string,
};

const app : Express = express();
const port : number = 3000;
const saltRounds : number = 12;

const pool = mysql.createPool({
  host: process.env.dbhost || 'localhost',
  user: process.env.dbuser,
  port: Number(process.env.dbport || 3306),
  password: process.env.dbpass,
  database: process.env.dbname,
  waitForConnections: true,    // Wait for a connection slot if all are busy
  connectionLimit: 10,         // Max number of parallel connections to open
  queueLimit: 0,               // Unlimited queueing when connectionLimit is reached
  enableKeepAlive: true        // Prevent stale connection dropouts
});

async function requireAuth(req: Request, res : Response, next : NextFunction) {
    try {
        const session_id = req.cookies.session_id;
        if(!session_id) return res.redirect('/index.html');

        const [sessions] = await pool.query<RowDataPacket[]>(
            `SELECT user_id
            FROM session
            WHERE session_id = ?
            AND expires_at > NOW()`,
            [session_id]
        );
        if (sessions.length === 0) {
            res.clearCookie("session_id", { path: "/" });
            return res.redirect("/index.html");
        };
        return next();
    } catch (error : unknown ) {
        let errorMessage = "Some error occured in auth ";
        if (error instanceof Error) errorMessage += error.message; 
        console.log(errorMessage);
        return res.status(500).json({ error: "Server error" });
    };
};

app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({extended : true}));
app.use(cookieParser());

app.get("/map", requireAuth, (req, res) => {
    res.sendFile("map.html", {
        root: "./private"
    });
});

app.post("/users", async (req :Request<Record<string, never>, unknown, Details>, res )=>{
    try {
        const {username : email, password} = req.body;
        if(typeof(email)!== 'string' || typeof(password)!== 'string' || email === "" || password === ""){
            return res.status(404).json({
                error : "Wrong parameters",
            });
        };
        const hashpass = await bcrypt.hash(password, saltRounds);
        const [insertResult] = await pool.query<ResultSetHeader>("INSERT INTO users(email, password) VALUES(?, ?)", [email, hashpass]);
        
        const sessionId = randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
        await pool.query("INSERT INTO session(session_id, expires_at, user_id) VALUES(?, ?, ?)", [sessionId, expiresAt, insertResult.insertId]);
        await pool.query("INSERT INTO score(score, score_id) VALUES(?, ?)", [0, insertResult.insertId]);
        res.cookie("session_id", sessionId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
            path: "/",
        });
        res.redirect('/map');
    }catch(error : unknown) {
        if (error instanceof Error && 'code' in error && (error as any).code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: "Email already registered" });
        };
        let errorMessage = "Something happened at querying ";
        if (error instanceof Error) errorMessage += error.message;
        console.log(errorMessage);
        return res.status(500).json({ error: "Server error" });
    };
});

app.post("/login", async(req : Request<Record<string, never>, unknown, Details>, res) => {
    try {
        const {username : email, password} = req.body;
        if(typeof(email)!== 'string' || typeof(password)!== 'string' || email === "" || password === ""){
            return res.status(400).json({
                error : "Email and password are required",
            });
        };
        const [result] =  await pool.query<User[]>("SELECT id, email, password FROM users WHERE email = ?",[email]);
        
        // in mysql2 query(...) resolves to an array with exactly two items, a tuple, not a single "query result" object:
        // [RowDataPacket[], FieldPacket[]]
        // [0]	rows (your actual data)	An array of your query results, one object per row 
        // [1]	fields	Metadata about the columns themselves, names, types, lengths, not your data
        // fields (the FieldPacket[]) describes the shape of the result set itself, column names, their SQL data types, character sets, whether they're nullable, and so on. This is metadata about the query's structure, not about any particular row's values. Most everyday app code never touches it, it's mainly useful for generic tooling that needs to introspect a result set without knowing the table's schema ahead of time, like building a database admin UI or a dynamic query tool.
        
        if (result.length === 0) return res.status(404).json({
            error : "Invalid Email"
        });
        const compRes : boolean = await bcrypt.compare(password, result[0].password);
        if (!compRes) {
            return res.status(401).json({
                error : "Invalid password",
            });
        };
        const sessionId = randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
        await pool.query(`INSERT INTO session (session_id, expires_at, user_id) VALUES (?, ?, ?)`, [sessionId, expiresAt, result[0].id]);
        res.cookie("session_id", sessionId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
            path: "/",
        });
        res.redirect("/map");
    } catch (error) {
        let errorMessage = "Some error occured at login either username/email or password is incorrect. ";
        if (error instanceof Error) errorMessage += error.message;
        console.log(errorMessage);
        return res.status(500).json({
            error : "Server error",
        });
    };
});

app.post("/score", requireAuth, async (req, res) => {
  try {
    const { finalScore } = req.body;
    const sessionId = req.cookies.session_id;

    if (
      !Number.isInteger(finalScore) ||
      finalScore < 0
    ) {
      return res.status(400).json({
        error: "Invalid score"
      });
    }

    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE score
       SET score = ?
       WHERE score_id = (
         SELECT user_id
         FROM session
         WHERE session_id = ?
           AND expires_at > NOW()
       )`,
      [finalScore, sessionId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: "Score record not found"
      });
    };

    return res.sendStatus(200);

  } catch (error) {
    console.error("Score update failed:", error);
    return res.status(500).json({
      error: "Server error"
    });
  }
});

app.post("/logout", async (req: Request, res: Response) => {
  try {
    const sessionId = req.cookies.session_id;

    if (sessionId) {
      await pool.query("DELETE FROM session WHERE session_id = ?", [sessionId]);
    };
    res.clearCookie("session_id", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    }).redirect("/index.html");

  } catch (error: unknown) {
    let errorMessage = "Error during logout: ";
    if (error instanceof Error) errorMessage += error.message;
    console.log(errorMessage);
    return res.status(500).json({ error: "Server error" });
  }
});

app.listen(port, () => {
    console.log(`Successfully listening to port : ${port}`);
});

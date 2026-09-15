import express from 'express';
import { get } from 'node:http';

const app = express();
const port = 3000;

app.use(express.static("public"));
app.set("view engine", "ejs");

app.get("/", (req, res) => {
    res.render('index.ejs');
});

app.listen(port, ()=>{
    console.log("Successfully listening to port:", port);
});
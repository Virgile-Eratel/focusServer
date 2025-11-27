import express, { Request, Response } from "express";
import "dotenv/config";


const port: number = Number(process.env.PORT) ?? 3000;

const app = express();

app.use(express.json());


app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.get("/status", (_req: Request, res: Response) => {
  res.json({
    mode: "unknown",
    manualPauseUntil: null,
    now: Date.now()
  });
});



app.listen(port, "127.0.0.1", () => {
  console.log(`Focus server running at http://127.0.0.1:${port}`);
});
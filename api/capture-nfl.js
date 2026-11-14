import { run } from "./capture.js";
import { SPORTS } from "./_lib.js";

// NFL cron (see vercel.json): Sunday, Monday and Thursday before kickoff.
export default (req, res) => run(req, res, SPORTS.nfl);

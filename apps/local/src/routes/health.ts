import { Response as ExpressResponse, Router } from "express";
import { success } from "../shared/api-response";

const router = Router();

router.get("/", async (_req, res: ExpressResponse) => {
    success(
      res,
      {
        status: "ok",
        uptime: process.uptime()
      },
      "Health check successful",
    );
  });

export const healthRouter = router;


import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import dashboardRouter from "./dashboard";
import projectsRouter from "./projects";
import freelancersRouter from "./freelancers";
import clientsRouter from "./clients";
import templatesRouter from "./templates";
import quotesRouter from "./quotes";
import expensesRouter from "./expenses";
import tasksRouter from "./tasks";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(dashboardRouter);
router.use(projectsRouter);
router.use(freelancersRouter);
router.use(clientsRouter);
router.use(templatesRouter);
router.use(quotesRouter);
router.use(expensesRouter);
router.use(tasksRouter);

export default router;

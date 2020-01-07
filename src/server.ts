import bodyParser from "body-parser";
import { Application } from "express";
import express, { Response } from "express";
import fs from "fs";
import morgan from "morgan";
import { InitializedProfile } from "../generated/definitions/backend/InitializedProfile";
import { UserMetadata } from "../generated/definitions/backend/UserMetadata";
import { backendInfo } from "../payloads/backend";
import { loginWithToken } from "../payloads/login";
import {
  getMessageWithContent,
  getMessageWithoutContentList
} from "../payloads/message";
import { getProfile } from "../payloads/profile";
import { ResponseHandler } from "../payloads/response";
import { getServiceMetadata, getServices } from "../payloads/service";
import { session } from "../payloads/session";
import { userMetadata } from "../payloads/userMetadata";
import { validatePayload } from "./utils/validator";
import { getWallets, getTransactions, sessionToken } from "../payloads/wallet";

// fiscalCode used within the client communication
export const fiscalCode = "RSSMRA83A12H501D";
// read package.json to print some info
const packageJson = JSON.parse(fs.readFileSync("./package.json").toString());
// create express server
export const serverPort = 3000;
const app: Application = express();
// set log middleware
app.use(morgan("tiny"));
app.use(bodyParser.json());
const responseHandler = new ResponseHandler(app);

app.get("/", (_, res) => {
  res.send(`Hi. This is ${packageJson.name}`);
});

app.get("/login", (_, res) => {
  res.redirect(loginWithToken);
});
app.post("/logout", (_, res) => {
  res.status(200).send("ok");
});

app.get("/info", (_, res) => {
  res.json(backendInfo);
});

app.get("/ping", (_, res) => {
  res.send("ok");
});

export const messages = getMessageWithoutContentList(10, fiscalCode);
export const services = getServices(10);
export const wallets = getWallets();
export const transactions = getTransactions(5);

/** wallet content */
app.get("/wallet/v1/users/actions/start-session", (_, res) => {
  res.json(sessionToken)
});

app.get("/wallet/v1/wallet", (_, res) => {
  res.json(wallets)
})

app.get("/wallet/v1/transactions", (_, res) => {
  res.json(transactions)
});

/** static contents */
app.get("/static_contents/services/:service_id", (req, res) => {
  const serviceId = req.params.service_id.replace(".json", "");
  res.json(getServiceMetadata(serviceId, services.payload).payload);
});

const sendFile = (filePath: string, res: Response) => {
  res.sendFile(filePath, {
    root: "."
  });
};

/** static contents */

app.get("/static_contents/logos/organizations/:organization_id", (_, res) => {
  // ignoring organization id and send always the same image
  sendFile("assets/imgs/logos/organizations/organization_1.png", res);
});

app.get("/static_contents/logos/services/:service_id", (_, res) => {
  // ignoring service id and send always the same image
  sendFile("assets/imgs/logos/services/service_1.png", res);
});

/** IO backend API handlers */

responseHandler
  .addHandler("get", "/session", session)
  .addHandler("get", "/profile", getProfile(fiscalCode))
  .addCustomHandler("post", "/profile", req => {
    // the server profile is merged with
    // the one coming from request. Furthermore this profile's version is increased by 1
    const currentProfile = getProfile(fiscalCode).payload;
    const clintProfileIncresed = {
      ...req.body,
      version: parseInt(req.body.version, 10) + 1
    };
    const payload = validatePayload(InitializedProfile, {
      ...currentProfile,
      ...clintProfileIncresed
    });
    return {
      payload,
      isJson: true
    };
  })
  .addHandler("get", "/user-metadata", userMetadata)
  .addCustomHandler("post", "/user-metadata", req => {
    // simply return the received user-metadata
    const payload = validatePayload(UserMetadata, req.body);
    return { payload };
  })
  // return 10 mock messages
  .addHandler("get", "/messages", messages)
  // return a mock message with content (always found!)
  .addCustomHandler("get", "/messages/:id", req => {
    // retrieve the service_id from the messages list
    const serviceId = messages.payload.items.find(
      item => item.id === req.params.id
    )?.sender_service_id;
    return getMessageWithContent(req.params.id, serviceId!, fiscalCode);
  })
  // return 10 mock services
  .addHandler("get", "/services", services)
  // return a mock service with the same requested id (always found!)
  .addCustomHandler("get", "/services/:service_id", req => {
    const service = services.payload.items.find(
      item => item.service_id === req.params.service_id
    );
    return { payload: service };
  });

export default app;

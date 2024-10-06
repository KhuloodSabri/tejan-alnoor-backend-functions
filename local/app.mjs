import express from "express";
import cors from "cors";
import { handler as supervisorHandler } from "../tejan-alnoor-supervisor-endpoint-function/index.mjs";
import { handler as adminHandler } from "../tejan-alnoor-admin-endpoint-function/index.mjs";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/", async (req, res) => {
  // Get the HTTP method
  const method = req.method;

  // Get the request headers
  const headers = req.headers;

  // Get the request body
  const body = req.body;

  // console.log("Request body:", body);

  // Get the request path
  const path = req.path;

  // Get the route parameters
  const params = req.params; // won't need

  // Get the query string parameters
  const query = req.query;

  const handler = path.startsWith("/admin") ? adminHandler : supervisorHandler;
  const handlerPath = path.startsWith("/admin")
    ? path.split("/admin")[1]
    : path.split("/supervisor")[1];

  const response = await handler({
    requestContext: {
      http: {
        method: method,
        path: handlerPath,
      },
    },
    body: JSON.stringify(body),
    headers: headers,
    queryStringParameters: query,
  });

  res.set(response.headers);
  res.status(response.statusCode).send(response.body);
});

app.listen("3033", () => {
  console.log("Server running on port 3033");
});

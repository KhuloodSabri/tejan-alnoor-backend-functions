import { auth } from "express-oauth2-jwt-bearer";

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const validateToken = async (token) => {
  const promise = new Promise((resolve, reject) => {
    // Your JWT verification middleware
    const checkJwt = auth({
      // audience: "https://dev-qvjwauok0omoznt3.us.auth0.com/api/v2/",
      // issuerBaseURL: "https://dev-qvjwauok0omoznt3.us.auth0.com/",

      audience: "https://khuloodsabri.github.io/",
      issuerBaseURL: "https://dev-qvjwauok0omoznt3.us.auth0.com/",
      tokenSigningAlg: "RS256",
    });

    // Mimic the req and res objects
    const req = {
      headers: {
        authorization: token,
      },
      is(type) {
        // A simple implementation for req.is()
        const contentType = this.headers["content-type"] || "";
        return contentType.includes(type);
      },
      // Add more properties if needed
    };

    const res = {
      statusCode: 200,
      status(status) {
        this.statusCode = status;
        if (status === 401) {
          reject(new HttpError(401, "Unauthorized"));
        }
        return this;
      },
      json(data) {
        console.log("Response JSON:", data);
      },
    };

    const next = (err) => {
      if (err) {
        console.error("Error in JWt validation:", err);
        reject(new HttpError(401, "Internal Server Error"));
      } else {
        console.log("Auth0 Token verification successful");
        const roles = req?.auth?.payload?.["tejan-alnoor/roles"] ?? [];

        if (!roles.includes("admin")) {
          reject(new HttpError(403, "Forbidden"));
        } else {
          resolve();
        }
      }
    };

    // Invoke the middleware
    checkJwt(req, res, next);
  });

  return promise;
};

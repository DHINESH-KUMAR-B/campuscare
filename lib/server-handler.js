const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { get, list, put } = require("@vercel/blob");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "complaints.json");
const RATINGS_FILE = path.join(DATA_DIR, "ratings.json");
const MAX_BODY_BYTES = 16 * 1024;
const CATEGORIES = [
  "Hostel",
  "Food & Dining",
  "Campus Cleanliness",
  "Laundry",
  "Ironing Service",
  "Anti-Ragging",
  "Cellphone & Network",
  "Clubs & Activities",
  "RO Water",
  "Facilities & Maintenance",
  "Lab & Laboratory",
  "Faculty & Teaching",
  "Sports & Cultural Activities",
  "Network Services",
  "Technology Support",
  "Emergency & Medical",
  "Academic Support",
  "Campus Safety",
  "IT & Wi-Fi",
  "Wellbeing & Accessibility",
  "Transport",
  "Other"
];
const PRIORITIES = ["Low", "Normal", "High", "Urgent"];
let writeQueue = Promise.resolve();

function usesBlobStorage() {
  if (process.env.VERCEL === "1" && !process.env.BLOB_STORE_ID && !process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Connect a private Vercel Blob store to this project before using the API.");
  }
  return process.env.VERCEL === "1" || Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
}

async function readBlobRecords(prefix) {
  const records = [];
  let cursor;
  let hasMore = true;
  while (hasMore) {
    const page = await list({ prefix, limit: 1000, cursor });
    for (const blob of page.blobs) {
      const result = await get(blob.url, { access: "private" });
      if (!result) throw new Error(`Could not read stored record ${blob.pathname}.`);
      records.push(JSON.parse(await new Response(result.stream).text()));
    }
    cursor = page.cursor;
    hasMore = page.hasMore;
  }
  return records;
}

async function writeBlobRecord(prefix, value) {
  await put(`${prefix}${randomUUID()}.json`, JSON.stringify(value), {
    access: "private",
    contentType: "application/json"
  });
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(value));
}

async function readComplaints() {
  if (usesBlobStorage()) return readBlobRecords("campuscare/complaints/");
  try {
    const contents = await fs.readFile(DATA_FILE, "utf8");
    const complaints = JSON.parse(contents);
    if (!Array.isArray(complaints)) throw new Error("The complaint data file must contain a JSON array.");
    return complaints;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function storeComplaint(complaint) {
  if (usesBlobStorage()) return writeBlobRecord("campuscare/complaints/", complaint);
  writeQueue = writeQueue.then(async () => {
    const complaints = await readComplaints();
    complaints.unshift(complaint);
    await fs.mkdir(DATA_DIR, { recursive: true });
    const temporaryFile = `${DATA_FILE}.${process.pid}.tmp`;
    await fs.writeFile(temporaryFile, `${JSON.stringify(complaints, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await fs.rename(temporaryFile, DATA_FILE);
  });
  return writeQueue;
}

async function readRatings() {
  if (usesBlobStorage()) return readBlobRecords("campuscare/ratings/");
  try {
    const ratings = JSON.parse(await fs.readFile(RATINGS_FILE, "utf8"));
    if (!Array.isArray(ratings)) throw new Error("The rating data file must contain a JSON array.");
    return ratings;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function storeRating(rating) {
  if (usesBlobStorage()) return writeBlobRecord("campuscare/ratings/", rating);
  writeQueue = writeQueue.then(async () => {
    const ratings = await readRatings();
    ratings.push(rating);
    await fs.mkdir(DATA_DIR, { recursive: true });
    const temporaryFile = `${RATINGS_FILE}.${process.pid}.tmp`;
    await fs.writeFile(temporaryFile, `${JSON.stringify(ratings, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await fs.rename(temporaryFile, RATINGS_FILE);
  });
  return writeQueue;
}

function readRequestBody(request) {
  if (request.body !== undefined) {
    try {
      const body = typeof request.body === "string" || Buffer.isBuffer(request.body)
        ? JSON.parse(request.body.toString())
        : request.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new Error("Request body must be a JSON object.");
      }
      if (Buffer.byteLength(JSON.stringify(body)) > MAX_BODY_BYTES) {
        return Promise.reject(Object.assign(new Error("Request body is too large."), { status: 413 }));
      }
      return Promise.resolve(body);
    } catch {
      return Promise.reject(Object.assign(new Error("Request body must be valid JSON."), { status: 400 }));
    }
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Request body is too large."), { status: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(Object.assign(new Error("Request body must be valid JSON."), { status: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function cleanString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/ratings") {
    const ratings = await readRatings();
    const summary = {};
    for (const rating of ratings) {
      const item = summary[rating.category] || { count: 0, total: 0 };
      item.count += 1;
      item.total += rating.rating;
      summary[rating.category] = item;
    }
    return sendJson(response, 200, {
      ratings: Object.fromEntries(Object.entries(summary).map(([category, item]) =>
        [category, { count: item.count, average: item.total / item.count }]))
    });
  }

  if (request.method === "POST" && url.pathname === "/api/ratings") {
    const body = await readRequestBody(request);
    const category = cleanString(body.category, 60);
    const rating = Number(body.rating);
    if (!CATEGORIES.includes(category) || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return sendJson(response, 400, { error: "Choose a valid service and a star rating from 1 to 5." });
    }
    await storeRating({ category, rating, createdAt: new Date().toISOString() });
    return sendJson(response, 201, { message: "Thanks for rating this service." });
  }

  if (request.method === "GET" && url.pathname === "/api/complaints") {
    const complaints = await readComplaints();
    const reference = cleanString(url.searchParams.get("reference"), 30);
    if (reference) {
      const email = cleanString(url.searchParams.get("email"), 120).toLowerCase();
      const match = complaints.find(item => item.id === reference && item.email.toLowerCase() === email);
      if (!match) return sendJson(response, 404, { error: "No matching complaint was found. Check the reference and college email." });
      return sendJson(response, 200, {
        complaint: {
          id: match.id, category: match.category, status: match.status,
          createdAt: match.createdAt, priority: match.priority
        }
      });
    }
    return sendJson(response, 200, {
      complaints: complaints.slice(0, 20).map(({ id, category, status, createdAt, priority }) =>
        ({ id, category, status, createdAt, priority }))
    });
  }

  if (request.method === "GET" && url.pathname === "/api/analytics") {
    const complaints = await readComplaints();
    const byCategory = {};
    const byStatus = {};
    const byPriority = {};
    for (const item of complaints) {
      byCategory[item.category] = (byCategory[item.category] || 0) + 1;
      byStatus[item.status] = (byStatus[item.status] || 0) + 1;
      byPriority[item.priority] = (byPriority[item.priority] || 0) + 1;
    }
    return sendJson(response, 200, { total: complaints.length, byCategory, byStatus, byPriority });
  }

  if (request.method === "POST" && url.pathname === "/api/complaints") {
    const body = await readRequestBody(request);
    const name = cleanString(body.name, 70);
    const email = cleanString(body.email, 120).toLowerCase();
    const category = cleanString(body.category, 60);
    const location = cleanString(body.location, 120);
    const description = cleanString(body.description, 2000);
    const priority = PRIORITIES.includes(body.priority) ? body.priority : "Normal";
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !CATEGORIES.includes(category) || !location || description.length < 8) {
      return sendJson(response, 400, { error: "Enter a valid name, email, category, location, and a description of at least 8 characters." });
    }
    const complaint = {
      id: `CC-${randomUUID().slice(0, 8).toUpperCase()}`,
      name, email, category, location, description, priority,
      status: "In review",
      createdAt: new Date().toISOString()
    };
    await storeComplaint(complaint);
    return sendJson(response, 201, {
      complaint: { id: complaint.id, category, status: complaint.status, createdAt: complaint.createdAt, priority }
    });
  }
  sendJson(response, 404, { error: "API route not found." });
}

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

async function serveStatic(response, pathname) {
  const requestedPath = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const filePath = path.resolve(ROOT, requestedPath);
  if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
    response.writeHead(403);
    return response.end("Forbidden");
  }
  try {
    const contents = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    });
    response.end(contents);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return response.end("Page not found");
    }
    throw error;
  }
}

async function handleRequest(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) await handleApi(request, response, url);
    else if (request.method === "GET" || request.method === "HEAD") await serveStatic(response, url.pathname);
    else sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error("Request failed:", error);
    if (!response.headersSent) sendJson(response, error.status || 500, {
      error: error.status ? error.message : "The server could not process this request."
    });
    else response.destroy();
  }
}

module.exports = handleRequest;

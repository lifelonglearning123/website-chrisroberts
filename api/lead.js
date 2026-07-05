// Secure server-side proxy for the contact form → GoHighLevel.
//
// The GHL token lives ONLY here, as a Vercel environment variable
// (GHL_TOKEN). It is never sent to the browser. The browser posts the
// form to /api/lead; this function talks to the GHL API with the token.
//
// Required env vars (set in Vercel → Project → Settings → Environment Variables):
//   GHL_TOKEN        Private Integration Token (scopes: contacts.write, contacts.readonly)
//   GHL_LOCATION_ID  the sub-account / location id
//
// GHL API: https://services.leadconnectorhq.com  (Version 2021-07-28)

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());

function normalisePhone(p) {
  if (!p) return "";
  let s = String(p).replace(/[^\d+]/g, "");
  if (s.startsWith("+")) return s;
  if (s.startsWith("00")) return "+" + s.slice(2);
  if (s.startsWith("0")) return "+44" + s.slice(1); // UK default
  return s;
}

function ghlHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Version: GHL_VERSION,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // Private Integration Tokens always start with "pit-"; location ids never do.
  // If the two env vars were entered swapped, use each value for what it is.
  let token = (process.env.GHL_TOKEN || "").trim();
  let locationId = (process.env.GHL_LOCATION_ID || "").trim();
  if (locationId.startsWith("pit-") && !token.startsWith("pit-")) {
    [token, locationId] = [locationId, token];
  }
  if (!token || !locationId) {
    console.error("[lead] Missing GHL_TOKEN or GHL_LOCATION_ID env vars");
    return res.status(500).json({ ok: false, error: "Server not configured" });
  }

  // Vercel parses JSON bodies automatically; guard for string bodies too.
  let data = req.body;
  if (typeof data === "string") { try { data = JSON.parse(data); } catch { data = {}; } }
  data = data || {};

  // Honeypot — pretend success, send nothing.
  if (data.company_website) return res.status(200).json({ ok: true });

  // Minimal validation (mirrors the client).
  const name = String(data.full_name || data.name || "").trim();
  const email = String(data.email || "").trim();
  const message = String(data.message || "").trim();
  if (!name || !isEmail(email) || !message) {
    return res.status(400).json({ ok: false, error: "Missing required fields" });
  }

  const parts = name.split(/\s+/);
  const firstName = parts.shift() || name;
  const lastName = parts.join(" ");
  const phone = normalisePhone(data.phone);
  const enquiryType = String(data.enquiry_type || "General enquiry");

  const tags = ["Website Enquiry"];
  if (/quote/i.test(enquiryType)) tags.push("Quote Request");
  else if (/consult/i.test(enquiryType)) tags.push("Consultation Request");

  try {
    // 1) Upsert the contact (avoids duplicate-email errors).
    const upsertBody = {
      locationId,
      firstName,
      lastName,
      name,
      email,
      companyName: String(data.company || "").trim() || undefined,
      source: String(data.source || "cr-assoc.net contact form"),
      tags,
    };
    if (phone) upsertBody.phone = phone;

    const upsertRes = await fetch(`${GHL_BASE}/contacts/upsert`, {
      method: "POST",
      headers: ghlHeaders(token),
      body: JSON.stringify(upsertBody),
    });

    const upsertText = await upsertRes.text();
    if (!upsertRes.ok) {
      console.error("[lead] upsert failed", upsertRes.status, upsertText);
      return res.status(502).json({ ok: false, error: "Could not save enquiry" });
    }

    let upsertJson = {};
    try { upsertJson = JSON.parse(upsertText); } catch {}
    const contactId = upsertJson?.contact?.id || upsertJson?.id || null;

    // 2) Attach the enquiry details as a Note (GHL-native record of the message).
    if (contactId) {
      const noteLines = [
        `New website enquiry — ${enquiryType}`,
        "",
        data.service_interest ? `Interested in: ${data.service_interest}` : null,
        data.company_size ? `Company size: ${data.company_size}` : null,
        data.company ? `Company: ${data.company}` : null,
        phone ? `Phone: ${phone}` : null,
        "",
        "Message:",
        message,
        "",
        `Source: ${data.source || "cr-assoc.net contact form"}`,
        data.page_url ? `Page: ${data.page_url}` : null,
        data.submitted_at ? `Submitted: ${data.submitted_at}` : null,
      ].filter((l) => l !== null);

      const noteRes = await fetch(`${GHL_BASE}/contacts/${contactId}/notes`, {
        method: "POST",
        headers: ghlHeaders(token),
        body: JSON.stringify({ body: noteLines.join("\n") }),
      });
      if (!noteRes.ok) {
        // Non-fatal: the contact is saved even if the note fails.
        console.error("[lead] note failed", noteRes.status, await noteRes.text());
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[lead] error", err);
    return res.status(500).json({ ok: false, error: "Unexpected error" });
  }
}

/* =============================================================
   Chris Roberts Associates — main.js
   Header state · mobile nav · scroll reveals · stat counters ·
   active-section nav · form handling.
   ============================================================= */
(function () {
  "use strict";

  // Flag that JS is active so reveal-on-scroll styles engage.
  // (If this script never runs, all content stays visible by default.)
  document.documentElement.classList.add("js");

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Header: solid on scroll ---------- */
  const header = document.getElementById("siteHeader");
  const onScroll = () => {
    if (window.scrollY > 24) header.classList.add("scrolled");
    else header.classList.remove("scrolled");
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- Mobile nav ---------- */
  const toggle = document.getElementById("navToggle");
  const mobileNav = document.getElementById("mobileNav");
  const mnavClose = document.getElementById("mnavClose");

  const openNav = () => {
    mobileNav.classList.add("open");
    mobileNav.setAttribute("aria-hidden", "false");
    toggle.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  };
  const closeNav = () => {
    mobileNav.classList.remove("open");
    mobileNav.setAttribute("aria-hidden", "true");
    toggle.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  };
  toggle && toggle.addEventListener("click", openNav);
  mnavClose && mnavClose.addEventListener("click", closeNav);
  mobileNav && mobileNav.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeNav));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeNav(); });

  /* ---------- Scroll reveals ---------- */
  const revealEls = document.querySelectorAll("[data-reveal], [data-reveal-stagger]");
  if (prefersReduced || !("IntersectionObserver" in window)) {
    revealEls.forEach((el) => el.classList.add("in"));
  } else {
    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
    );
    revealEls.forEach((el) => io.observe(el));
  }

  /* ---------- Animated stat counters ---------- */
  const counters = document.querySelectorAll("[data-count]");
  const runCount = (el) => {
    const target = parseFloat(el.getAttribute("data-count"));
    const suffix = el.getAttribute("data-suffix") || "";
    const plain = el.getAttribute("data-plain") === "true"; // e.g. a year — no grouping
    if (prefersReduced) {
      el.textContent = (plain ? target : target.toLocaleString("en-GB")) + suffix;
      return;
    }
    const dur = 1500;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = Math.round(target * eased);
      el.textContent = (plain ? val : val.toLocaleString("en-GB")) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if ("IntersectionObserver" in window) {
    const cio = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) { runCount(entry.target); obs.unobserve(entry.target); }
        });
      },
      { threshold: 0.6 }
    );
    counters.forEach((c) => cio.observe(c));
  } else {
    counters.forEach(runCount);
  }

  /* ---------- Active nav link on scroll ---------- */
  const sections = ["services", "approach", "sectors", "about", "faq", "contact"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  const navLinks = document.querySelectorAll(".nav a");
  if ("IntersectionObserver" in window && sections.length) {
    const sio = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            navLinks.forEach((l) =>
              l.classList.toggle("active", l.getAttribute("href") === "#" + id)
            );
          }
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );
    sections.forEach((s) => sio.observe(s));
  }

  /* ---------- FAQ accordion ---------- */
  // Each question is a <button aria-expanded> controlling its answer region.
  // Toggling is independent (multiple can be open) so users don't lose their place.
  document.querySelectorAll(".faq-q").forEach((btn) => {
    btn.addEventListener("click", () => {
      const item = btn.closest(".faq-item");
      const open = item.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });

  /* ---------- Footer year ---------- */
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Enquiry form (delivered via GHL) ---------- */
  // Posts to our own serverless proxy (/api/lead), which holds the GHL token
  // server-side and creates the contact. The token is NEVER in this file.
  // For local file:// preview there is no server, so we fall back to the
  // demo success state (see below).
  const FORM_ENDPOINT = "/api/lead";
  const IS_LOCAL_FILE = location.protocol === "file:";

  const form = document.getElementById("enquiryForm");
  const successBox = document.getElementById("formSuccess");
  const statusBox = document.getElementById("formStatus");
  const submitBtn = document.getElementById("submitBtn");

  const setInvalid = (input, on) => {
    const field = input.closest(".field");
    if (field) field.classList.toggle("invalid", on);
  };

  const validate = () => {
    let ok = true;
    const name = form.name;
    const email = form.email;
    const message = form.message;

    if (!name.value.trim()) { setInvalid(name, true); ok = false; } else setInvalid(name, false);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { setInvalid(email, true); ok = false; } else setInvalid(email, false);
    if (!message.value.trim()) { setInvalid(message, true); ok = false; } else setInvalid(message, false);
    return ok;
  };

  if (form) {
    // clear invalid state as the user fixes fields
    ["name", "email", "message"].forEach((n) => {
      form[n].addEventListener("input", function () {
        if (this.closest(".field").classList.contains("invalid")) validate();
      });
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      statusBox.className = "form-status";
      statusBox.textContent = "";

      if (!validate()) {
        const firstBad = form.querySelector(".field.invalid input, .field.invalid textarea");
        firstBad && firstBad.focus();
        return;
      }

      const data = Object.fromEntries(new FormData(form).entries());

      const showSuccess = () => {
        form.style.display = "none";
        successBox.classList.add("show");
        successBox.scrollIntoView({ behavior: prefersReduced ? "auto" : "smooth", block: "center" });
      };

      // Honeypot — bots fill the hidden field. Pretend success, send nothing.
      if (data.company_website) { showSuccess(); return; }
      delete data.company_website;

      submitBtn.disabled = true;
      const originalLabel = submitBtn.innerHTML;
      submitBtn.innerHTML = "Sending…";

      // Build the GHL payload. Field names are what the workflow will map;
      // full_name/email/phone match GHL's standard contact fields.
      const payload = {
        full_name: data.name,
        email: data.email,
        phone: data.phone || "",
        company: data.company || "",
        company_size: data.size || "",
        service_interest: data.interest || "",
        enquiry_type: data.enquiryType || "",
        message: data.message,
        source: data.source || "cr-assoc.net contact form",
        page_url: location.href,
        submitted_at: new Date().toISOString(),
      };

      if (!FORM_ENDPOINT || IS_LOCAL_FILE) {
        // No server available (opened as a local file) — demo success, no post.
        setTimeout(showSuccess, 500);
        return;
      }

      try {
        const res = await fetch(FORM_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Request failed");
        showSuccess();
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalLabel;
        statusBox.className = "form-status err";
        statusBox.textContent = "Sorry — something went wrong. Please email chris@cr-assoc.net or call 07760 227389.";
      }
    });
  }
})();

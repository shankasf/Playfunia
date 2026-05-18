"""Export all Playfunia business info from Supabase as a natural-language text KB.

Output: chatbot_service/data/playfunia_knowledge_base.txt

The file is organized into topical sections with `##` headers so a chunker
can split on those boundaries. Within each section, every entity gets one
self-contained paragraph written in plain English — good shape for embeddings
and easy for the model to quote directly.
"""
from __future__ import annotations

import os
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
from typing import Any

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(ROOT / ".env")

PG = dict(
    host="db.wzmcmbkouodsfbfxaozd.supabase.co",
    port=5432,
    user="postgres",
    dbname="postgres",
    password=os.environ["supabase_db_password"],
)

OUT_PATH = ROOT / "chatbot_service" / "data" / "playfunia_knowledge_base.txt"

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def money(v) -> str:
    if v is None:
        return "—"
    f = float(v)
    return f"${f:,.0f}" if f.is_integer() else f"${f:,.2f}"


def pct(v) -> str:
    if v is None:
        return "0%"
    return f"{float(v):g}%"


def fmt_time(v) -> str:
    if v is None:
        return ""
    if isinstance(v, time):
        s = v.strftime("%I:%M %p").lstrip("0")
        # 10:00 AM -> 10 AM
        return s.replace(":00 ", " ")
    return str(v)


def fmt_date(v) -> str:
    if v is None:
        return ""
    if isinstance(v, (datetime, date)):
        return v.strftime("%B %-d, %Y")
    return str(v)


def fetch(cur, sql: str) -> list[dict]:
    cur.execute(sql)
    return [dict(r) for r in cur.fetchall()]


def join_and(items: list[str]) -> str:
    items = [i for i in items if i]
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return ", ".join(items[:-1]) + f", and {items[-1]}"


# ---------- section writers ------------------------------------------------------

def section_about(cur, out: list[str]):
    locs = fetch(cur, "SELECT * FROM public.locations WHERE is_active IS NOT FALSE ORDER BY location_id")
    out.append("## About Playfunia & Location\n")
    out.append(
        "Playfunia is an indoor play center for children, offering open play, birthday parties, "
        "memberships, and special events in a safe, kid-focused environment.\n"
    )
    for r in locs:
        name = r.get("name") or "Playfunia"
        addr_parts = [r.get("address"), r.get("city"), r.get("state"), r.get("postal_code")]
        addr = ", ".join(p for p in addr_parts if p) or "—"
        phone = r.get("phone") or "—"
        email = r.get("email") or "—"
        out.append(
            f"The {name} location is at {addr}. "
            f"You can reach the {name} location by phone at {phone} or by email at {email}.\n"
        )


def section_hours(cur, out: list[str]):
    rows = fetch(cur, """
        SELECT * FROM public.store_hours
        WHERE is_active IS NOT FALSE
        ORDER BY location_name, day_of_week
    """)
    if not rows:
        return
    by_loc: dict[str, list[dict]] = {}
    for r in rows:
        by_loc.setdefault(r.get("location_name") or "Playfunia", []).append(r)

    out.append("## Hours of Operation\n")
    for loc, day_rows in by_loc.items():
        day_rows.sort(key=lambda r: r["day_of_week"])
        sentences = []
        for r in day_rows:
            day = DAYS[r["day_of_week"]] if 0 <= r["day_of_week"] < 7 else f"Day {r['day_of_week']}"
            if r.get("is_closed"):
                sentences.append(f"On {day} the {loc} location is closed.")
            else:
                sentences.append(
                    f"On {day} the {loc} location is open from "
                    f"{fmt_time(r.get('open_time'))} to {fmt_time(r.get('close_time'))}."
                )
        out.append(" ".join(sentences) + "\n")


def section_tickets(cur, out: list[str]):
    rows = fetch(cur, """
        SELECT * FROM public.ticket_types
        WHERE is_active IS NOT FALSE
        ORDER BY child_count NULLS FIRST, base_price_usd
    """)
    if not rows:
        return
    out.append("## Open Play Admission Tickets\n")
    out.append(
        "Open play admission gives children unlimited play time at Playfunia for the day. "
        "Pricing depends on the number of children and there are sibling bundles to make group visits easier.\n"
    )
    for r in rows:
        name = r.get("name")
        price = money(r.get("base_price_usd"))
        cc = r.get("child_count") or 0
        desc = (r.get("description") or "").strip().rstrip(".")
        reqs = []
        if r.get("requires_waiver"): reqs.append("a signed waiver")
        if r.get("requires_grip_socks"): reqs.append("grip socks")

        if cc == 0:
            sent = f"The {name} ticket costs {price}. {desc}." if desc else f"The {name} ticket costs {price}."
        elif cc == 1:
            sent = f"The {name} ticket is {price} and gives one child unlimited play for the day."
        else:
            sent = f"The {name} is {price} and covers {cc} children with unlimited play for the day."
        if reqs:
            sent += f" This ticket requires {join_and(reqs)}."
        out.append(sent + "\n")


def section_memberships(cur, out: list[str]):
    rows = fetch(cur, """
        SELECT * FROM public.membership_plans
        WHERE is_active IS NOT FALSE
        ORDER BY monthly_price
    """)
    if not rows:
        return
    promos = fetch(cur, """
        SELECT * FROM public.product_promotions
        WHERE is_active IS NOT FALSE AND product_type='membership'
    """)
    promo_by_plan = {p["product_id"]: p for p in promos}

    out.append("## Membership Plans\n")
    out.append(
        "Playfunia memberships give families unlimited open play visits each month for a flat monthly price. "
        "Each plan covers a fixed number of children and adults and comes with grip socks and full access to the play areas.\n"
    )
    for r in rows:
        name = r.get("name")
        price = money(r.get("monthly_price"))
        kids = r.get("max_children") or 0
        adults = r.get("max_adults") or 0
        visits = r.get("visits_per_month")
        visits_phrase = "unlimited visits per month" if visits is None else f"{visits} visits per month"
        guests = r.get("guest_passes_per_month") or 0
        disc = float(r.get("discount_percent") or 0)
        benefits = r.get("benefits") or []

        people = f"{kids} child{'ren' if kids != 1 else ''} and {adults} adult{'s' if adults != 1 else ''}"
        sent = (
            f"The {name} membership costs {price} per month and covers {people} with {visits_phrase}."
        )
        # filter benefits that just restate coverage or unlimited visits
        def _is_redundant(b: str) -> bool:
            bl = b.lower()
            if "unlimited" in bl and "visit" in bl: return True
            if "kid" in bl and "adult" in bl and "included" in bl: return True
            return False
        extra_benefits = [b for b in benefits if not _is_redundant(b)]
        if extra_benefits:
            sent += f" Members also get {join_and(extra_benefits)}."
        if guests:
            sent += f" Each month members receive {guests} guest pass{'es' if guests != 1 else ''}."
        if disc:
            sent += f" Members get a {pct(disc)} discount on additional purchases."

        promo = promo_by_plan.get(r["plan_id"])
        if promo:
            label = promo.get("promo_label") or "limited-time promo"
            disc_str = (
                f"{float(promo['discount_value']):g}% off"
                if promo.get("discount_type") == "percent" else money(promo.get("discount_value")) + " off"
            )
            ends = fmt_date(promo.get("ends_at"))
            note = (promo.get("promo_note") or "").strip().rstrip(".")
            sent += (
                f" There is currently a promotion on the {name}: {label} ({disc_str})"
                + (f" through {ends}" if ends else "") + "."
                + (f" {note}." if note else "")
            )

        out.append(sent + "\n")


def section_parties(cur, out: list[str]):
    pkgs = fetch(cur, """
        SELECT * FROM public.party_packages
        WHERE is_active IS NOT FALSE
        ORDER BY price_usd
    """)
    addons = fetch(cur, """
        SELECT * FROM public.party_add_ons
        WHERE is_active IS NOT FALSE
        ORDER BY display_order, add_on_id
    """)
    cleaning_fee = None
    cur.execute("SELECT config_value FROM public.pricing_config WHERE config_key='cleaning_fee'")
    row = cur.fetchone()
    if row:
        cleaning_fee = float(row["config_value"])

    if not pkgs and not addons:
        return

    out.append("## Birthday Party Packages\n")
    if pkgs:
        out.append(
            "Playfunia hosts birthday parties with exclusive use of a private party room while guests "
            "also enjoy access to the open play area. Three party packages are available at different price points.\n"
        )
    for r in pkgs:
        name = r.get("name")
        price = money(r.get("price_usd"))
        kids = r.get("base_children") or 0
        hours = r.get("base_room_hours")
        hours_str = (f"{hours:g}" if hours is not None else "—").rstrip("0").rstrip(".")
        included = []
        if r.get("includes_food"): included.append("food")
        if r.get("includes_drinks"): included.append("drinks")
        if r.get("includes_decor"): included.append("themed decorations")

        sent = (
            f"The {name} party package is {price} and covers up to {kids} children with "
            f"{hours_str} hour{'s' if hours_str != '1' else ''} of private party room time plus all-day open play access."
        )
        if included:
            sent += f" The package includes {join_and(included)}."
        else:
            sent += " Guests bring their own food, drinks, and decorations for this package."

        ec = r.get("extra_child_price")
        ea = r.get("extra_adult_price")
        if ec is not None or ea is not None:
            extras = []
            if ec is not None: extras.append(f"extra children are {money(ec)} each")
            if ea is not None: extras.append(f"extra adults are {money(ea)} each")
            sent += " " + (", ".join(extras).capitalize() + ".")

        feats = [f for f in (r.get("features") or []) if isinstance(f, str)]
        if feats:
            sent += " Package details: " + " ".join(f.rstrip(".") + "." for f in feats)

        terms = r.get("additional_terms") or []
        if terms:
            term_lines = []
            for t in terms:
                if isinstance(t, dict):
                    title = (t.get("title") or "").strip()
                    desc = (t.get("description") or "").strip().rstrip(".")
                    if title and desc:
                        term_lines.append(f"{title.lower()} — {desc}")
            if term_lines:
                sent += " Terms to know: " + "; ".join(term_lines) + "."

        out.append(sent + "\n")

    if cleaning_fee is not None:
        out.append(
            f"A cleaning fee of {money(cleaning_fee)} is added to every party booking, "
            "and a 50% deposit is required at booking to reserve the party room.\n"
        )

    if addons:
        out.append("### Party Add-Ons\n")
        out.append(
            "On top of any party package, families can purchase add-ons at checkout to extend or enhance the party experience.\n"
        )
        for r in addons:
            label = r.get("label")
            price = money(r.get("price"))
            pt = r.get("price_type") or "flat"
            unit = {"flat": "", "perChild": " per additional child", "duration": " per added hour"}.get(pt, "")
            desc = (r.get("description") or "").strip().rstrip(".")
            sent = f"The {label} add-on costs {price}{unit}."
            if desc:
                sent += f" {desc}."
            out.append(sent + "\n")


def section_pricing_fees(cur, out: list[str]):
    rows = fetch(cur, """
        SELECT * FROM public.pricing_config
        WHERE is_active IS NOT FALSE
        ORDER BY config_key
    """)
    if not rows:
        return
    PERCENT = {"deposit_percentage", "tax_rate", "sibling_discount_rate"}
    SKIP = {"tax_rate"}  # internal/admin

    rows = [r for r in rows if r["config_key"] not in SKIP]
    if not rows:
        return

    out.append("## Additional Pricing & Fees\n")
    out.append("Beyond ticket and package prices, the following fees and rates apply at Playfunia.\n")
    for r in rows:
        key = r["config_key"]
        val = float(r.get("config_value") or 0)
        display = f"{val:g}%" if key in PERCENT else money(val)
        desc = (r.get("description") or "").strip().rstrip(".")
        readable = key.replace("_", " ").capitalize()
        out.append(f"{readable}: {display}. {desc}.\n")


def section_promotions(cur, out: list[str]):
    codes = fetch(cur, """
        SELECT * FROM public.promotions
        WHERE is_active IS NOT FALSE
        ORDER BY code
    """)
    offers = fetch(cur, """
        SELECT * FROM public.promo_offers
        WHERE is_active IS NOT FALSE
        ORDER BY offer_id
    """)
    if not codes and not offers:
        return
    out.append("## Current Promotions & Discount Codes\n")
    for r in codes:
        code = r.get("code")
        po = float(r.get("percent_off") or 0)
        ao = r.get("amount_off_usd")
        applies = r.get("applies_to") or []
        scope = join_and(list(applies)) if applies else "all eligible purchases"
        ends = fmt_date(r.get("valid_to"))
        disc = f"{po:g}% off" if po else f"{money(ao)} off"
        min_purch = r.get("min_purchase_usd")
        sent = f"Promo code {code} gives {disc} on {scope}"
        if ends: sent += f" and is valid through {ends}"
        if min_purch: sent += f", with a minimum purchase of {money(min_purch)}"
        sent += "."
        desc = (r.get("description") or "").strip().rstrip(".")
        if desc: sent += f" {desc}."
        out.append(sent + "\n")
    for r in offers:
        title = (r.get("title") or "").strip()
        sub = (r.get("subtitle") or "").strip().rstrip(".")
        label = r.get("promo_label") or ""
        ends = fmt_date(r.get("ends_at"))
        sent = f"{title} promotion"
        if label: sent += f" ({label})"
        if sub: sent += f": {sub}"
        if ends: sent += f", running through {ends}"
        out.append(sent.rstrip(".") + ".\n")


def section_events(cur, out: list[str]):
    today = date.today()
    rows = fetch(cur, """
        SELECT * FROM public.events
        WHERE is_published IS NOT FALSE
        ORDER BY start_date
    """)

    upcoming = []
    for r in rows:
        end_dt = r.get("end_date") or r.get("start_date")
        if end_dt is None:
            continue
        ed = end_dt.date() if isinstance(end_dt, datetime) else end_dt
        if ed >= today:
            upcoming.append(r)

    out.append("## Events & Special Activities\n")
    out.append(
        "Playfunia organizes special events on a monthly basis throughout the year, "
        "from seasonal celebrations and holiday parties to giveaways and themed family days. "
        "Each event typically features festive activities for kids — like face painting, raffles, "
        "and photo opportunities — along with a limited-time discount or offer that families can "
        "take advantage of during the event. Follow Playfunia on Instagram or check back with us "
        "to find out about the next upcoming event.\n"
    )

    if not upcoming:
        out.append(
            "There are no upcoming events scheduled at this time, but a new event is typically "
            "announced each month — reach out to Playfunia for the latest event calendar and active offers.\n"
        )
        return

    out.append("Currently scheduled upcoming events:\n")
    for r in upcoming:
        title = (r.get("title") or "").strip().rstrip()
        start = fmt_date(r.get("start_date"))
        end = fmt_date(r.get("end_date"))
        when = start if (not end or start == end) else f"{start} through {end}"
        desc = " ".join((r.get("description") or "").split())
        sent = f"Event '{title}'"
        if when: sent += f" is scheduled for {when}"
        sent += ". " + desc
        out.append(sent.strip() + "\n")


def section_faqs(cur, out: list[str]):
    rows = fetch(cur, """
        SELECT * FROM public.faqs
        WHERE is_active IS NOT FALSE
        ORDER BY COALESCE(category,'~'), display_order, faq_id
    """)
    if not rows:
        return
    out.append("## Frequently Asked Questions\n")
    out.append(
        "These are common questions families ask about visiting Playfunia, "
        "booking parties, memberships, and general policies.\n"
    )
    current_cat = object()
    for r in rows:
        cat = r.get("category") or "general"
        if cat != current_cat:
            current_cat = cat
            out.append(f"### {cat.title()} FAQs\n")
        q = (r.get("question") or "").strip()
        a = " ".join((r.get("answer") or "").split())
        out.append(f"Q: {q}\nA: {a}\n")


def section_announcements(cur, out: list[str]):
    rows = fetch(cur, """
        SELECT * FROM public.announcements
        WHERE is_active IS NOT FALSE
          AND (expires_at IS NULL OR expires_at >= now())
          AND (publish_date IS NULL OR publish_date <= now())
        ORDER BY publish_date DESC NULLS LAST
    """)
    if not rows:
        return
    out.append("## Announcements & Current Programs\n")
    out.append(
        "These are current Playfunia programs, recurring offers, and announcements "
        "that families should know about.\n"
    )
    for r in rows:
        title = (r.get("title") or "").strip()
        body = " ".join((r.get("body") or "").split())
        out.append(f"{title}: {body}\n")


def section_jobs(cur, out: list[str]):
    rows = fetch(cur, """
        SELECT * FROM public.job_listings
        WHERE is_active IS NOT FALSE
        ORDER BY display_order, listing_id
    """)
    if not rows:
        return
    out.append("## Careers — Open Positions\n")
    out.append("Playfunia is hiring for the roles listed below. To apply, contact the Albany location.\n")
    for r in rows:
        title = r.get("title")
        bits = []
        if r.get("employment_type"): bits.append(r["employment_type"])
        if r.get("department"): bits.append(f"in the {r['department']} team")
        if r.get("location"): bits.append(f"based at {r['location']}")
        if r.get("pay_range"): bits.append(f"with pay in the {r['pay_range']} range")
        if r.get("minimum_age"): bits.append(f"minimum age {r['minimum_age']}")
        if r.get("schedule_notes"): bits.append(r["schedule_notes"])
        sent = f"{title}" + (" — " + "; ".join(bits) if bits else "") + "."
        desc = (r.get("description") or "").strip()
        if desc: sent += " " + desc

        for label, field in [("Responsibilities", "responsibilities"),
                             ("Qualifications", "qualifications"),
                             ("Nice to have", "nice_to_have"),
                             ("Perks", "perks")]:
            items = r.get(field) or []
            if items:
                sent += f" {label}: " + "; ".join(items) + "."

        out.append(sent.strip() + "\n")


# ---------- main ----------------------------------------------------------------

def main():
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    out: list[str] = []
    out.append("# Playfunia Knowledge Base\n")
    out.append(
        f"This document contains current business information for Playfunia, "
        f"extracted from the production database on {datetime.utcnow().strftime('%B %d, %Y')}. "
        "It is organized by topic and written in plain English for use as a chatbot knowledge base.\n"
    )

    conn = psycopg2.connect(cursor_factory=psycopg2.extras.RealDictCursor, **PG)
    with conn.cursor() as cur:
        section_about(cur, out)
        section_hours(cur, out)
        section_tickets(cur, out)
        section_memberships(cur, out)
        section_parties(cur, out)
        section_pricing_fees(cur, out)
        section_promotions(cur, out)
        section_announcements(cur, out)
        section_events(cur, out)
        section_faqs(cur, out)
        section_jobs(cur, out)
    conn.close()

    text = "\n".join(s.rstrip() + "\n" for s in out)
    OUT_PATH.write_text(text, encoding="utf-8")
    print(f"Wrote {OUT_PATH} ({len(text):,} chars, {text.count(chr(10))} lines)")


if __name__ == "__main__":
    main()

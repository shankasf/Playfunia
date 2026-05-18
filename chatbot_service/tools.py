"""Structured-data + semantic tools the head agent can call.

Each public function in this module is exposed to the LLM as a tool. The
function returns a JSON-serializable dict (the tool result). The OpenAI
JSON-schema for each tool is in TOOL_SCHEMAS at the bottom.

Design rules
------------
* Tools only execute parameterized, hard-coded SQL — never user-supplied SQL.
* Tools apply `is_active`/`is_published`/date-window filters themselves so
  the agent cannot accidentally surface retired records.
* Tools return both raw numeric values AND human display strings ($X.XX, %)
  so the answer model can quote them directly without doing math.
* Heavy logic (recommendations, totals) is done in Python, not delegated
  to the LLM — that's the whole point of having structured tools.
"""
from __future__ import annotations

import re
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from db import fetch_all, fetch_one, ro_cursor


STORE_TZ = ZoneInfo("America/New_York")
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
DAY_INDEX = {d.lower(): i for i, d in enumerate(DAYS)}


# ---------- helpers --------------------------------------------------------------

def _money(v) -> str:
    if v is None:
        return "—"
    f = float(v)
    return f"${f:,.0f}" if f.is_integer() else f"${f:,.2f}"


def _pct(v) -> str:
    if v is None:
        return "0%"
    return f"{float(v):g}%"


def _fmt_time(t: time | None) -> str:
    if t is None:
        return ""
    s = t.strftime("%I:%M %p").lstrip("0")
    return s.replace(":00 ", " ")


def _fmt_date(v) -> str:
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.strftime("%B %-d, %Y")
    if isinstance(v, date):
        return v.strftime("%B %-d, %Y")
    return str(v)


def _now_local() -> datetime:
    return datetime.now(STORE_TZ)


def _to_jsonable(v: Any) -> Any:
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (datetime, date, time)):
        return v.isoformat()
    if isinstance(v, dict):
        return {k: _to_jsonable(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_to_jsonable(x) for x in v]
    return v


def _day_to_index(day: str | int) -> int | None:
    if day is None:
        return None
    if isinstance(day, int):
        return day if 0 <= day <= 6 else None
    s = day.strip().lower()
    if s == "today":
        return _now_local().weekday()
    if s == "tomorrow":
        return (_now_local().weekday() + 1) % 7
    if s in DAY_INDEX:
        return DAY_INDEX[s]
    return None


# =============================================================================
#  TICKETS
# =============================================================================

def list_tickets(min_price: float | None = None, max_price: float | None = None,
                 child_count: int | None = None, sort: str = "price_asc",
                 limit: int = 20) -> dict:
    """List active open-play admission tickets, optionally filtered/sorted."""
    where = ["is_active IS NOT FALSE"]
    params: list = []
    if min_price is not None:
        where.append("base_price_usd >= %s"); params.append(min_price)
    if max_price is not None:
        where.append("base_price_usd <= %s"); params.append(max_price)
    if child_count is not None:
        where.append("child_count = %s"); params.append(child_count)

    order = {"price_asc": "base_price_usd ASC",
             "price_desc": "base_price_usd DESC",
             "name": "name ASC"}.get(sort, "base_price_usd ASC")

    sql = f"SELECT * FROM ticket_types WHERE {' AND '.join(where)} ORDER BY {order} LIMIT %s"
    params.append(min(limit, 50))

    with ro_cursor() as cur:
        rows = fetch_all(cur, sql, tuple(params))

    return {"tickets": [_ticket_view(r) for r in rows], "count": len(rows)}


def get_ticket(name: str) -> dict:
    """Look up one ticket by exact or fuzzy name match."""
    sql = """
        SELECT * FROM ticket_types
        WHERE is_active IS NOT FALSE
          AND (LOWER(name) = LOWER(%s) OR LOWER(name) LIKE LOWER(%s))
        ORDER BY (LOWER(name) = LOWER(%s)) DESC, base_price_usd ASC
        LIMIT 1
    """
    with ro_cursor() as cur:
        row = fetch_one(cur, sql, (name, f"%{name}%", name))
    return {"ticket": _ticket_view(row) if row else None}


def find_best_ticket_for(num_children: int) -> dict:
    """Recommend the cheapest ticket option for a given number of children.

    Tries an exact sibling-bundle match first. Falls back to the cheapest
    larger bundle, or pairs the largest bundle with extra-child admission
    if the family is bigger than any single bundle.
    """
    if num_children < 1:
        return {"error": "num_children must be >= 1"}

    with ro_cursor() as cur:
        all_tix = fetch_all(cur,
            "SELECT * FROM ticket_types WHERE is_active IS NOT FALSE AND child_count > 0 "
            "ORDER BY child_count ASC, base_price_usd ASC")
        extra_cfg = fetch_one(cur,
            "SELECT config_value FROM pricing_config "
            "WHERE config_key='extra_child_admission' AND is_active IS NOT FALSE")

    if not all_tix:
        return {"recommendation": None, "note": "no tickets configured"}

    exact = [t for t in all_tix if t["child_count"] == num_children]
    if exact:
        best = min(exact, key=lambda t: t["base_price_usd"])
        return {
            "recommendation": _ticket_view(best),
            "explanation": f"Exact match: {best['name']} covers {num_children} children for {_money(best['base_price_usd'])}.",
            "total_usd": float(best["base_price_usd"]),
            "total_display": _money(best["base_price_usd"]),
        }

    larger = [t for t in all_tix if t["child_count"] >= num_children]
    if larger:
        best = min(larger, key=lambda t: t["base_price_usd"])
        return {
            "recommendation": _ticket_view(best),
            "explanation": (f"No exact bundle for {num_children} kids; the next-size-up "
                            f"{best['name']} covers up to {best['child_count']} for {_money(best['base_price_usd'])}."),
            "total_usd": float(best["base_price_usd"]),
            "total_display": _money(best["base_price_usd"]),
        }

    biggest = max(all_tix, key=lambda t: t["child_count"])
    extra_n = num_children - biggest["child_count"]
    extra_unit = float(extra_cfg["config_value"]) if extra_cfg else 15.0
    total = float(biggest["base_price_usd"]) + extra_n * extra_unit
    return {
        "recommendation": _ticket_view(biggest),
        "explanation": (f"No bundle covers {num_children} kids. Best combo: "
                        f"{biggest['name']} ({_money(biggest['base_price_usd'])}) "
                        f"+ {extra_n} extra-child admissions at {_money(extra_unit)} each."),
        "extra_child_count": extra_n,
        "extra_child_price_each_usd": extra_unit,
        "total_usd": total,
        "total_display": _money(total),
    }


def estimate_admission_total(num_children: int, num_adults: int = 0,
                              with_grip_socks: bool = False) -> dict:
    """Estimate total cost for a family visit (children + extra adults + grip socks)."""
    best = find_best_ticket_for(num_children)
    if "error" in best:
        return best

    with ro_cursor() as cur:
        extra_adult = fetch_one(cur,
            "SELECT config_value FROM pricing_config "
            "WHERE config_key='extra_adult_admission_price' AND is_active IS NOT FALSE")
        grip = fetch_one(cur,
            "SELECT config_value FROM pricing_config "
            "WHERE config_key='grip_socks_price' AND is_active IS NOT FALSE")

    extra_adult_unit = float(extra_adult["config_value"]) if extra_adult else 5.0
    grip_unit = float(grip["config_value"]) if grip else 3.0

    base = float(best["total_usd"])
    adults_cost = max(0, num_adults) * extra_adult_unit
    socks_cost = num_children * grip_unit if with_grip_socks else 0
    total = base + adults_cost + socks_cost

    return {
        "ticket": best["recommendation"],
        "explanation": best["explanation"],
        "breakdown": {
            "tickets_usd": base,
            "extra_adults_usd": adults_cost,
            "grip_socks_usd": socks_cost,
        },
        "breakdown_display": {
            "tickets": _money(base),
            f"extra adults ({num_adults} × {_money(extra_adult_unit)})": _money(adults_cost),
            f"grip socks ({num_children} × {_money(grip_unit)})": _money(socks_cost) if with_grip_socks else "—",
        },
        "total_usd": total,
        "total_display": _money(total),
    }


def _ticket_view(r: dict | None) -> dict | None:
    if not r:
        return None
    return {
        "ticket_id": r["ticket_type_id"],
        "name": r.get("name"),
        "price_usd": float(r.get("base_price_usd") or 0),
        "price_display": _money(r.get("base_price_usd")),
        "child_count": r.get("child_count"),
        "requires_waiver": bool(r.get("requires_waiver")),
        "requires_grip_socks": bool(r.get("requires_grip_socks")),
        "description": (r.get("description") or "").strip(),
    }


# =============================================================================
#  MEMBERSHIPS
# =============================================================================

def list_memberships(covers_children: int | None = None,
                     covers_adults: int | None = None,
                     max_price: float | None = None,
                     sort: str = "price_asc",
                     limit: int = 20) -> dict:
    """List active membership plans with any current promo inlined."""
    where = ["is_active IS NOT FALSE"]
    params: list = []
    if covers_children is not None:
        where.append("max_children >= %s"); params.append(covers_children)
    if covers_adults is not None:
        where.append("max_adults >= %s"); params.append(covers_adults)
    if max_price is not None:
        where.append("monthly_price <= %s"); params.append(max_price)

    order = {"price_asc": "monthly_price ASC",
             "price_desc": "monthly_price DESC"}.get(sort, "monthly_price ASC")

    sql = f"SELECT * FROM membership_plans WHERE {' AND '.join(where)} ORDER BY {order} LIMIT %s"
    params.append(min(limit, 50))

    with ro_cursor() as cur:
        rows = fetch_all(cur, sql, tuple(params))
        promos = _active_membership_promos(cur)
    return {"memberships": [_membership_view(r, promos.get(r["plan_id"])) for r in rows],
            "count": len(rows)}


def get_membership(name: str) -> dict:
    with ro_cursor() as cur:
        row = fetch_one(cur,
            """SELECT * FROM membership_plans
               WHERE is_active IS NOT FALSE
                 AND (LOWER(name) = LOWER(%s) OR LOWER(name) LIKE LOWER(%s))
               ORDER BY (LOWER(name) = LOWER(%s)) DESC
               LIMIT 1""",
            (name, f"%{name}%", name))
        promos = _active_membership_promos(cur) if row else {}
    return {"membership": _membership_view(row, promos.get(row["plan_id"]) if row else None) if row else None}


def find_best_membership_for(num_children: int, num_adults: int = 0) -> dict:
    """Cheapest plan that covers the requested family size."""
    with ro_cursor() as cur:
        rows = fetch_all(cur,
            """SELECT * FROM membership_plans
               WHERE is_active IS NOT FALSE
                 AND max_children >= %s AND max_adults >= %s
               ORDER BY monthly_price ASC LIMIT 5""",
            (num_children, num_adults))
        promos = _active_membership_promos(cur)
    if not rows:
        return {"recommendation": None,
                "note": f"No plan covers {num_children} child(ren) + {num_adults} adult(s)."}
    best = rows[0]
    return {
        "recommendation": _membership_view(best, promos.get(best["plan_id"])),
        "alternatives": [_membership_view(r, promos.get(r["plan_id"])) for r in rows[1:3]],
    }


def compare_memberships(names: list[str]) -> dict:
    plans = []
    seen = set()
    for n in names:
        d = get_membership(n).get("membership")
        if d and d["plan_id"] not in seen:
            plans.append(d); seen.add(d["plan_id"])
    if len(plans) < 2:
        return {"error": "Need at least 2 distinct plans to compare."}
    return {
        "plans": plans,
        "cheapest": min(plans, key=lambda p: p["monthly_price_usd"])["name"],
        "most_children": max(plans, key=lambda p: p["max_children"] or 0)["name"],
        "most_benefits": max(plans, key=lambda p: len(p.get("benefits") or []))["name"],
    }


def monthly_membership_break_even(num_children: int, num_adults: int = 0) -> dict:
    """How many visits per month before the cheapest covering plan beats open play?"""
    plan = find_best_membership_for(num_children, num_adults).get("recommendation")
    if not plan:
        return {"error": "No plan covers that family size."}
    ticket = find_best_ticket_for(num_children)
    per_visit = float(ticket["total_usd"])
    extra_adult_per_visit = 0
    if num_adults > 0:
        with ro_cursor() as cur:
            ea = fetch_one(cur,
                "SELECT config_value FROM pricing_config WHERE config_key='extra_adult_admission_price'")
        extra_adult_per_visit = (float(ea["config_value"]) if ea else 5.0) * num_adults
    visit_cost = per_visit + extra_adult_per_visit
    monthly = float(plan["monthly_price_usd"])
    if visit_cost <= 0:
        return {"error": "Could not compute per-visit cost."}
    visits_to_break_even = monthly / visit_cost
    return {
        "plan": plan["name"],
        "plan_monthly_usd": monthly,
        "per_visit_usd": visit_cost,
        "per_visit_display": _money(visit_cost),
        "visits_to_break_even": round(visits_to_break_even, 1),
        "explanation": (
            f"The {plan['name']} is {_money(monthly)}/month. "
            f"Open play for {num_children} child(ren) + {num_adults} adult(s) is {_money(visit_cost)} per visit. "
            f"The membership pays for itself after roughly {round(visits_to_break_even, 1)} visits per month."
        ),
    }


def _active_membership_promos(cur) -> dict[int, dict]:
    rows = fetch_all(cur,
        """SELECT * FROM product_promotions
           WHERE is_active IS NOT FALSE
             AND product_type='membership'
             AND (starts_at IS NULL OR starts_at <= now())
             AND (ends_at IS NULL OR ends_at >= now())""")
    return {r["product_id"]: r for r in rows}


def _membership_view(r: dict | None, promo: dict | None = None) -> dict | None:
    if not r:
        return None
    monthly = float(r.get("monthly_price") or 0)
    out = {
        "plan_id": r["plan_id"],
        "name": r.get("name"),
        "monthly_price_usd": monthly,
        "monthly_price_display": _money(monthly),
        "max_children": r.get("max_children") or 0,
        "max_adults": r.get("max_adults") or 0,
        "visits_per_month": r.get("visits_per_month"),  # None = unlimited
        "guest_passes_per_month": r.get("guest_passes_per_month") or 0,
        "member_discount_percent": float(r.get("discount_percent") or 0),
        "benefits": list(r.get("benefits") or []),
    }
    if promo:
        dv = float(promo.get("discount_value") or 0)
        if promo.get("discount_type") == "percent":
            promo_price = monthly * (1 - dv / 100.0)
            disc_text = f"{dv:g}% off"
        else:
            promo_price = max(0, monthly - dv)
            disc_text = f"{_money(dv)} off"
        out["active_promotion"] = {
            "label": promo.get("promo_label"),
            "discount": disc_text,
            "note": promo.get("promo_note"),
            "ends_at": _fmt_date(promo.get("ends_at")) or None,
            "promo_price_usd": round(promo_price, 2),
            "promo_price_display": _money(promo_price),
        }
    return out


# =============================================================================
#  PARTY PACKAGES + ADD-ONS
# =============================================================================

def list_party_packages(includes_food: bool | None = None,
                        includes_decor: bool | None = None,
                        max_price: float | None = None,
                        sort: str = "price_asc",
                        limit: int = 20) -> dict:
    where = ["is_active IS NOT FALSE"]
    params: list = []
    if includes_food is not None:
        where.append("includes_food = %s"); params.append(includes_food)
    if includes_decor is not None:
        where.append("includes_decor = %s"); params.append(includes_decor)
    if max_price is not None:
        where.append("price_usd <= %s"); params.append(max_price)
    order = {"price_asc": "price_usd ASC", "price_desc": "price_usd DESC"}.get(sort, "price_usd ASC")
    sql = f"SELECT * FROM party_packages WHERE {' AND '.join(where)} ORDER BY {order} LIMIT %s"
    params.append(min(limit, 50))
    with ro_cursor() as cur:
        rows = fetch_all(cur, sql, tuple(params))
    return {"packages": [_package_view(r) for r in rows], "count": len(rows)}


def get_party_package(name: str) -> dict:
    with ro_cursor() as cur:
        row = fetch_one(cur,
            """SELECT * FROM party_packages
               WHERE is_active IS NOT FALSE
                 AND (LOWER(name) = LOWER(%s) OR LOWER(name) LIKE LOWER(%s))
               ORDER BY (LOWER(name) = LOWER(%s)) DESC LIMIT 1""",
            (name, f"%{name}%", name))
    return {"package": _package_view(row) if row else None}


def find_best_party_package(num_kids: int, needs_food: bool = False,
                             needs_decor: bool = False, budget: float | None = None) -> dict:
    where = ["is_active IS NOT FALSE"]
    params: list = []
    if needs_food:
        where.append("includes_food = TRUE")
    if needs_decor:
        where.append("includes_decor = TRUE")
    if budget is not None:
        where.append("price_usd <= %s"); params.append(budget)
    sql = f"SELECT * FROM party_packages WHERE {' AND '.join(where)} ORDER BY price_usd ASC LIMIT 5"
    with ro_cursor() as cur:
        rows = fetch_all(cur, sql, tuple(params))
    if not rows:
        return {"recommendation": None,
                "note": "No active package matches those requirements."}
    return {
        "recommendation": _package_view(rows[0]),
        "alternatives": [_package_view(r) for r in rows[1:3]],
        "note": (None if num_kids <= (rows[0]["base_children"] or 0)
                 else f"Heads up: this package's base covers {rows[0]['base_children']} kids; "
                      f"each additional child is {_money(rows[0]['extra_child_price'])}."),
    }


def estimate_party_total(package_name: str, num_kids: int, num_adults: int = 0,
                          extra_hours: int = 0, addons: list[str] | None = None,
                          promo_code: str | None = None) -> dict:
    """Full party cost breakdown including extras, add-ons, cleaning fee, deposit, promo."""
    pkg_resp = get_party_package(package_name)
    pkg = pkg_resp.get("package")
    if not pkg:
        return {"error": f"Unknown package '{package_name}'."}

    base = pkg["price_usd"]
    base_kids = pkg["base_children"] or 0
    extra_kid_unit = pkg["extra_child_price_usd"]
    extra_adult_unit = pkg["extra_adult_price_usd"]
    extra_kids = max(0, num_kids - base_kids)
    extra_kids_cost = extra_kids * extra_kid_unit
    extra_adults_cost = max(0, num_adults) * extra_adult_unit

    with ro_cursor() as cur:
        addon_rows = fetch_all(cur,
            "SELECT * FROM party_add_ons WHERE is_active IS NOT FALSE")
        cleaning = fetch_one(cur,
            "SELECT config_value FROM pricing_config WHERE config_key='cleaning_fee'")
        deposit = fetch_one(cur,
            "SELECT config_value FROM pricing_config WHERE config_key='deposit_percentage'")
        promo = None
        if promo_code:
            promo = fetch_one(cur,
                """SELECT * FROM promotions
                   WHERE is_active IS NOT FALSE
                     AND UPPER(code) = UPPER(%s)
                     AND (valid_to IS NULL OR valid_to >= now())
                     AND (valid_from IS NULL OR valid_from <= now())""",
                (promo_code,))

    addon_lookup = {r["code"]: r for r in addon_rows} | {r["label"].lower(): r for r in addon_rows}
    addon_lines: list[dict] = []
    extra_hours_cost = 0.0
    if extra_hours > 0:
        eh = addon_lookup.get("extra_hour")
        if eh:
            extra_hours_cost = extra_hours * float(eh["price"])
            addon_lines.append({"name": "Extra Hour", "qty": extra_hours,
                                "unit_usd": float(eh["price"]),
                                "total_usd": extra_hours_cost})
    for code_or_label in (addons or []):
        a = addon_lookup.get(code_or_label) or addon_lookup.get(code_or_label.lower())
        if not a or a["code"] == "extra_hour":
            continue
        addon_lines.append({"name": a["label"], "qty": 1,
                            "unit_usd": float(a["price"]),
                            "total_usd": float(a["price"])})
    addons_total = sum(a["total_usd"] for a in addon_lines)

    cleaning_fee = float(cleaning["config_value"]) if cleaning else 0.0
    subtotal = base + extra_kids_cost + extra_adults_cost + addons_total + cleaning_fee

    discount = 0.0
    discount_note = None
    if promo:
        po = float(promo.get("percent_off") or 0)
        ao = float(promo.get("amount_off_usd") or 0)
        applies = list(promo.get("applies_to") or [])
        if applies and "party_booking" not in applies:
            discount_note = (f"Code {promo_code} only applies to {', '.join(applies)} "
                             "— not applied to this party total.")
        else:
            min_p = float(promo.get("min_purchase_usd") or 0)
            if subtotal < min_p:
                discount_note = (f"Code {promo_code} requires a minimum purchase of {_money(min_p)} "
                                 f"(subtotal is {_money(subtotal)}) — not applied.")
            else:
                discount = subtotal * (po / 100.0) if po else ao
                discount_note = f"Promo {promo['code']} applied: {_pct(po) if po else _money(ao)} off."
    elif promo_code:
        discount_note = f"Code {promo_code} is not valid or not currently active."

    total = max(0.0, subtotal - discount)
    deposit_pct = float(deposit["config_value"]) if deposit else 0.0
    deposit_due = round(total * deposit_pct / 100.0, 2)

    breakdown = [
        {"item": f"{pkg['name']} base ({base_kids} kids, {pkg['base_room_hours']} hrs)",
         "amount_usd": base, "amount_display": _money(base)},
    ]
    if extra_kids > 0:
        breakdown.append({"item": f"Extra children ({extra_kids} × {_money(extra_kid_unit)})",
                          "amount_usd": extra_kids_cost,
                          "amount_display": _money(extra_kids_cost)})
    if num_adults > 0:
        breakdown.append({"item": f"Extra adults ({num_adults} × {_money(extra_adult_unit)})",
                          "amount_usd": extra_adults_cost,
                          "amount_display": _money(extra_adults_cost)})
    for line in addon_lines:
        breakdown.append({"item": f"{line['name']} ({line['qty']} × {_money(line['unit_usd'])})",
                          "amount_usd": line["total_usd"],
                          "amount_display": _money(line["total_usd"])})
    if cleaning_fee:
        breakdown.append({"item": "Cleaning fee",
                          "amount_usd": cleaning_fee,
                          "amount_display": _money(cleaning_fee)})
    if discount:
        breakdown.append({"item": f"Discount ({promo_code})",
                          "amount_usd": -discount,
                          "amount_display": "-" + _money(discount)})

    return {
        "package": pkg["name"],
        "num_kids": num_kids,
        "num_adults": num_adults,
        "breakdown": breakdown,
        "subtotal_usd": round(subtotal, 2),
        "subtotal_display": _money(subtotal),
        "discount_usd": round(discount, 2),
        "discount_note": discount_note,
        "total_usd": round(total, 2),
        "total_display": _money(total),
        "deposit_due_usd": deposit_due,
        "deposit_due_display": _money(deposit_due),
        "deposit_percent": deposit_pct,
    }


def list_party_addons() -> dict:
    with ro_cursor() as cur:
        rows = fetch_all(cur,
            "SELECT * FROM party_add_ons WHERE is_active IS NOT FALSE ORDER BY display_order, add_on_id")
    return {"addons": [_addon_view(r) for r in rows], "count": len(rows)}


def get_party_addon(code_or_label: str) -> dict:
    with ro_cursor() as cur:
        row = fetch_one(cur,
            """SELECT * FROM party_add_ons
               WHERE is_active IS NOT FALSE
                 AND (LOWER(code) = LOWER(%s) OR LOWER(label) = LOWER(%s) OR LOWER(label) LIKE LOWER(%s))
               LIMIT 1""",
            (code_or_label, code_or_label, f"%{code_or_label}%"))
    return {"addon": _addon_view(row) if row else None}


def _package_view(r: dict | None) -> dict | None:
    if not r:
        return None
    return {
        "package_id": r["package_id"],
        "name": r.get("name"),
        "price_usd": float(r.get("price_usd") or 0),
        "price_display": _money(r.get("price_usd")),
        "base_children": r.get("base_children") or 0,
        "base_room_hours": float(r.get("base_room_hours") or 0),
        "includes_food": bool(r.get("includes_food")),
        "includes_drinks": bool(r.get("includes_drinks")),
        "includes_decor": bool(r.get("includes_decor")),
        "extra_child_price_usd": float(r.get("extra_child_price") or 0),
        "extra_adult_price_usd": float(r.get("extra_adult_price") or 0),
        "features": _to_jsonable(r.get("features") or []),
        "additional_terms": _to_jsonable(r.get("additional_terms") or []),
        "description": (r.get("description") or "").strip(),
    }


def _addon_view(r: dict | None) -> dict | None:
    if not r:
        return None
    return {
        "add_on_id": r["add_on_id"],
        "code": r.get("code"),
        "label": r.get("label"),
        "price_usd": float(r.get("price") or 0),
        "price_display": _money(r.get("price")),
        "price_type": r.get("price_type") or "flat",
        "description": (r.get("description") or "").strip(),
    }


# =============================================================================
#  PROMOTIONS
# =============================================================================

def list_active_promotions(applies_to: str | None = None, kind: str | None = None) -> dict:
    """Returns currently-active promotions across codes, product promos, offers."""
    out: list[dict] = []
    with ro_cursor() as cur:
        if kind in (None, "code"):
            rows = fetch_all(cur,
                """SELECT * FROM promotions
                   WHERE is_active IS NOT FALSE
                     AND (valid_from IS NULL OR valid_from <= now())
                     AND (valid_to   IS NULL OR valid_to   >= now())""")
            for r in rows:
                applies = list(r.get("applies_to") or [])
                if applies_to and applies_to not in applies:
                    continue
                po = float(r.get("percent_off") or 0)
                ao = float(r.get("amount_off_usd") or 0)
                out.append({
                    "kind": "code",
                    "code": r.get("code"),
                    "discount_display": _pct(po) + " off" if po else _money(ao) + " off",
                    "applies_to": applies,
                    "ends_at": _fmt_date(r.get("valid_to")) or None,
                    "min_purchase_usd": float(r["min_purchase_usd"]) if r.get("min_purchase_usd") else None,
                    "description": (r.get("description") or "").strip(),
                })
        if kind in (None, "product"):
            rows = fetch_all(cur,
                """SELECT * FROM product_promotions
                   WHERE is_active IS NOT FALSE
                     AND (starts_at IS NULL OR starts_at <= now())
                     AND (ends_at   IS NULL OR ends_at   >= now())""")
            for r in rows:
                if applies_to and applies_to != r.get("product_type"):
                    continue
                dv = float(r.get("discount_value") or 0)
                out.append({
                    "kind": "product",
                    "label": r.get("promo_label"),
                    "product_type": r.get("product_type"),
                    "product_id": r.get("product_id"),
                    "discount_display": (f"{dv:g}% off" if r.get("discount_type") == "percent"
                                         else f"{_money(dv)} off"),
                    "ends_at": _fmt_date(r.get("ends_at")) or None,
                    "note": (r.get("promo_note") or "").strip(),
                })
        if kind in (None, "offer"):
            rows = fetch_all(cur,
                """SELECT * FROM promo_offers
                   WHERE is_active IS NOT FALSE
                     AND (starts_at IS NULL OR starts_at <= now())
                     AND (ends_at   IS NULL OR ends_at   >= now())""")
            for r in rows:
                out.append({
                    "kind": "offer",
                    "title": r.get("title"),
                    "subtitle": r.get("subtitle"),
                    "label": r.get("promo_label"),
                    "ends_at": _fmt_date(r.get("ends_at")) or None,
                    "note": (r.get("promo_note") or "").strip(),
                })
    return {"promotions": out, "count": len(out)}


def get_promotion_by_code(code: str) -> dict:
    with ro_cursor() as cur:
        r = fetch_one(cur,
            "SELECT * FROM promotions WHERE UPPER(code) = UPPER(%s)", (code,))
    if not r:
        return {"promotion": None, "status": "not_found"}
    now = datetime.now()
    expired = r.get("valid_to") and r["valid_to"].replace(tzinfo=None) < now.replace(tzinfo=None)
    not_yet  = r.get("valid_from") and r["valid_from"].replace(tzinfo=None) > now.replace(tzinfo=None)
    status = "expired" if expired else "pending" if not_yet else ("active" if r.get("is_active") else "inactive")
    po = float(r.get("percent_off") or 0); ao = float(r.get("amount_off_usd") or 0)
    return {
        "promotion": {
            "code": r["code"],
            "discount_display": _pct(po) + " off" if po else _money(ao) + " off",
            "applies_to": list(r.get("applies_to") or []),
            "ends_at": _fmt_date(r.get("valid_to")) or None,
            "min_purchase_usd": float(r["min_purchase_usd"]) if r.get("min_purchase_usd") else None,
            "description": (r.get("description") or "").strip(),
        },
        "status": status,
    }


# =============================================================================
#  HOURS / LOCATION / FEES / EVENTS / JOBS
# =============================================================================

def get_hours(day: str | int | None = None, location: str | None = None) -> dict:
    """Return hours for one day, or all days if not specified."""
    where = ["is_active IS NOT FALSE"]; params: list = []
    if location:
        where.append("LOWER(location_name) = LOWER(%s)"); params.append(location)
    di = _day_to_index(day) if day else None
    if di is not None:
        where.append("day_of_week = %s"); params.append(di)
    sql = f"SELECT * FROM store_hours WHERE {' AND '.join(where)} ORDER BY location_name, day_of_week"
    with ro_cursor() as cur:
        rows = fetch_all(cur, sql, tuple(params))
    return {
        "hours": [{
            "location": r.get("location_name") or "Playfunia",
            "day_of_week": DAYS[r["day_of_week"]] if 0 <= r["day_of_week"] < 7 else None,
            "opens": _fmt_time(r.get("open_time")) if not r.get("is_closed") else None,
            "closes": _fmt_time(r.get("close_time")) if not r.get("is_closed") else None,
            "is_closed": bool(r.get("is_closed")),
        } for r in rows],
    }


def is_open_now(location: str | None = None) -> dict:
    """Returns current open/closed status AND the next open window in every case.

    `next_open` is always populated so the bot can answer "when do you open
    next" coherently whether we're currently open, closed for the day, or
    just hit early/late hours.
    """
    now = _now_local()
    today_idx = now.weekday()
    where = ["is_active IS NOT FALSE", "day_of_week = %s"]
    params: list = [today_idx]
    if location:
        where.append("LOWER(location_name) = LOWER(%s)"); params.append(location)
    with ro_cursor() as cur:
        today = fetch_one(cur,
            f"SELECT * FROM store_hours WHERE {' AND '.join(where)} LIMIT 1", tuple(params))

    loc_name = (today.get("location_name") if today else None) or location or "Playfunia"
    base = {"location": loc_name, "now_local": now.strftime("%A %I:%M %p")}

    if not today or today.get("is_closed"):
        return {**base, "is_open": False, "reason": "closed today",
                "next_open": _next_open_window()}

    open_t: time = today["open_time"]
    close_t: time = today["close_time"]
    now_t = now.time().replace(microsecond=0)

    if open_t <= now_t < close_t:
        # When open today, "next" naturally refers to the next opening after
        # today's close — usually tomorrow.
        return {**base, "is_open": True,
                "closes_at": _fmt_time(close_t),
                "next_open": _next_open_window()}

    return {**base, "is_open": False,
            "reason": "before opening" if now_t < open_t else "after closing",
            "next_open": (f"today at {_fmt_time(open_t)}" if now_t < open_t
                          else _next_open_window())}


def _next_open_window() -> str | None:
    now = _now_local()
    with ro_cursor() as cur:
        rows = fetch_all(cur,
            "SELECT * FROM store_hours WHERE is_active IS NOT FALSE ORDER BY day_of_week")
    by_day = {r["day_of_week"]: r for r in rows}
    for offset in range(1, 8):
        idx = (now.weekday() + offset) % 7
        r = by_day.get(idx)
        if r and not r.get("is_closed"):
            return f"{DAYS[idx]} at {_fmt_time(r['open_time'])}"
    return None


def get_location(name: str | None = None) -> dict:
    where = ["is_active IS NOT FALSE"]; params: list = []
    if name:
        where.append("LOWER(name) LIKE LOWER(%s)"); params.append(f"%{name}%")
    sql = f"SELECT * FROM locations WHERE {' AND '.join(where)} ORDER BY location_id LIMIT 5"
    with ro_cursor() as cur:
        rows = fetch_all(cur, sql, tuple(params))
    return {"locations": [{
        "location_id": r["location_id"],
        "name": r.get("name"),
        "street": r.get("address"),
        "city": r.get("city"),
        "state": r.get("state"),
        "postal_code": r.get("postal_code"),
        "phone": r.get("phone"),
        "email": r.get("email"),
        "full_address": ", ".join([x for x in [r.get("address"), r.get("city"),
                                               r.get("state"), r.get("postal_code")] if x]),
    } for r in rows]}


def get_fee(key: str) -> dict:
    """Look up a single customer-facing fee by key (e.g. cleaning_fee, deposit_percentage)."""
    INTERNAL = {"tax_rate"}
    if key in INTERNAL:
        return {"fee": None, "note": f"'{key}' is an internal config value, not customer-facing."}
    with ro_cursor() as cur:
        r = fetch_one(cur,
            "SELECT * FROM pricing_config WHERE LOWER(config_key)=LOWER(%s) AND is_active IS NOT FALSE",
            (key,))
    if not r:
        return {"fee": None, "note": f"No fee called '{key}'."}
    val = float(r["config_value"])
    is_pct = key in {"deposit_percentage", "sibling_discount_rate"}
    return {"fee": {
        "key": r["config_key"],
        "value": val,
        "unit": "percent" if is_pct else "USD",
        "display": _pct(val) if is_pct else _money(val),
        "description": (r.get("description") or "").strip(),
    }}


def list_upcoming_events(limit: int = 10) -> dict:
    today = date.today()
    with ro_cursor() as cur:
        rows = fetch_all(cur,
            """SELECT * FROM events
               WHERE is_published IS NOT FALSE
                 AND COALESCE(end_date, start_date) >= %s
               ORDER BY start_date ASC LIMIT %s""",
            (today, min(limit, 30)))
    return {"events": [{
        "event_id": r["event_id"],
        "title": (r.get("title") or "").strip(),
        "start_date": r.get("start_date").isoformat() if r.get("start_date") else None,
        "end_date": r.get("end_date").isoformat() if r.get("end_date") else None,
        "when_display": _fmt_date(r.get("start_date")),
        "description": " ".join((r.get("description") or "").split()),
    } for r in rows], "count": len(rows)}


_FAQ_STOPWORDS = frozenset({
    "a", "an", "and", "are", "as", "at", "be", "by", "do", "for", "from", "i",
    "in", "is", "it", "of", "on", "or", "our", "the", "to", "we", "what",
    "when", "where", "which", "with", "you", "your", "any", "can", "have",
    "has", "this", "that", "about", "policy", "policies",
})


def _faq_tokens(query: str) -> list[str]:
    out: list[str] = []
    for raw in re.split(r"[^a-zA-Z0-9]+", query.lower()):
        if len(raw) < 3 or raw in _FAQ_STOPWORDS:
            continue
        out.append(raw)
    return out[:6]  # cap to keep the SQL bounded


def search_faqs(query: str | None = None, category: str | None = None,
                 limit: int = 10) -> dict:
    """Token-AND search on FAQ question+answer.

    The user's `query` is tokenized (stopwords dropped, words <3 chars
    dropped). Each remaining token must appear in either question or answer.
    If no row matches all tokens, falls back to any-token OR match. If no
    tokens at all (or empty `query`), returns the first N FAQs.
    """
    base_where = ["is_active IS NOT FALSE"]
    base_params: list = []
    if category:
        base_where.append("LOWER(category) = LOWER(%s)")
        base_params.append(category)

    tokens = _faq_tokens(query) if query else []
    rows: list[dict] = []

    with ro_cursor() as cur:
        if tokens:
            # AND of (question OR answer) per token
            and_clauses = ["(question ILIKE %s OR answer ILIKE %s)"] * len(tokens)
            and_params: list = []
            for t in tokens:
                pat = f"%{t}%"
                and_params.extend([pat, pat])
            sql = (f"SELECT * FROM faqs "
                   f"WHERE {' AND '.join(base_where + and_clauses)} "
                   f"ORDER BY display_order, faq_id LIMIT %s")
            rows = fetch_all(cur, sql, tuple(base_params + and_params + [min(limit, 30)]))

            if not rows:
                # OR fallback so single-keyword queries still hit when only one
                # term aligns with the FAQ wording.
                or_clauses = ["(question ILIKE %s OR answer ILIKE %s)"] * len(tokens)
                or_params: list = []
                for t in tokens:
                    pat = f"%{t}%"
                    or_params.extend([pat, pat])
                sql = (f"SELECT *, "
                       f"     (CASE WHEN question ILIKE %s THEN 2 ELSE 0 END "
                       f"      + CASE WHEN answer ILIKE %s THEN 1 ELSE 0 END) AS _score "
                       f"FROM faqs "
                       f"WHERE {' AND '.join(base_where)} AND ({' OR '.join(or_clauses)}) "
                       f"ORDER BY _score DESC, display_order, faq_id LIMIT %s")
                # Score uses the first token (most salient when LLM puts main term first)
                first_pat = f"%{tokens[0]}%"
                rows = fetch_all(cur,
                                 sql,
                                 tuple([first_pat, first_pat] + base_params + or_params + [min(limit, 30)]))
        else:
            sql = (f"SELECT * FROM faqs WHERE {' AND '.join(base_where)} "
                   f"ORDER BY display_order, faq_id LIMIT %s")
            rows = fetch_all(cur, sql, tuple(base_params + [min(limit, 30)]))

    return {"faqs": [{
        "faq_id": r["faq_id"],
        "question": (r.get("question") or "").strip(),
        "answer":   (r.get("answer")   or "").strip(),
        "category": r.get("category"),
    } for r in rows], "count": len(rows), "tokens": tokens}


def list_active_announcements(limit: int = 10) -> dict:
    """Currently-active announcements (not expired)."""
    with ro_cursor() as cur:
        rows = fetch_all(cur,
            """SELECT * FROM announcements
               WHERE is_active IS NOT FALSE
                 AND (expires_at IS NULL OR expires_at >= now())
                 AND (publish_date IS NULL OR publish_date <= now())
               ORDER BY publish_date DESC NULLS LAST LIMIT %s""",
            (min(limit, 30),))
    return {"announcements": [{
        "announcement_id": r["announcement_id"],
        "title": (r.get("title") or "").strip(),
        "body":  (r.get("body")  or "").strip(),
        "publish_date": _fmt_date(r.get("publish_date")) or None,
        "expires_at":   _fmt_date(r.get("expires_at"))   or None,
    } for r in rows], "count": len(rows)}


def list_open_positions(department: str | None = None,
                         employment_type: str | None = None) -> dict:
    where = ["is_active IS NOT FALSE",
             "(closes_at IS NULL OR closes_at >= now())"]
    params: list = []
    if department:
        where.append("LOWER(department) = LOWER(%s)"); params.append(department)
    if employment_type:
        where.append("LOWER(employment_type) = LOWER(%s)"); params.append(employment_type)
    sql = f"SELECT * FROM job_listings WHERE {' AND '.join(where)} ORDER BY display_order, listing_id"
    with ro_cursor() as cur:
        rows = fetch_all(cur, sql, tuple(params))
    return {"positions": [{
        "listing_id": r["listing_id"],
        "title": r.get("title"),
        "department": r.get("department"),
        "employment_type": r.get("employment_type"),
        "location": r.get("location"),
        "pay_range": r.get("pay_range"),
        "minimum_age": r.get("minimum_age"),
        "schedule_notes": r.get("schedule_notes"),
        "description": (r.get("description") or "").strip(),
        "responsibilities": list(r.get("responsibilities") or []),
        "qualifications":   list(r.get("qualifications")   or []),
        "perks":            list(r.get("perks")            or []),
    } for r in rows], "count": len(rows)}


# =============================================================================
#  SEMANTIC SEARCH (wraps existing Chroma collection)
# =============================================================================

def _semantic_search_impl(query: str, k: int = 5) -> dict:
    """Lazy import — main.py initialises the chroma collection on startup."""
    from semantic import semantic_search  # type: ignore
    return semantic_search(query, k)


def search_knowledge_base(query: str, k: int = 5) -> dict:
    """Free-form retrieval over the curated text KB.

    Use this when no structured tool applies — e.g. open-ended questions
    about policies, marketing copy, party-room features, or anything not
    yet captured as a structured tool.
    """
    return _semantic_search_impl(query, k)


# =============================================================================
#  TOOL REGISTRY
# =============================================================================

TOOL_HANDLERS: dict[str, Any] = {
    # tickets
    "list_tickets": list_tickets,
    "get_ticket": get_ticket,
    "find_best_ticket_for": find_best_ticket_for,
    "estimate_admission_total": estimate_admission_total,
    # memberships
    "list_memberships": list_memberships,
    "get_membership": get_membership,
    "find_best_membership_for": find_best_membership_for,
    "compare_memberships": compare_memberships,
    "monthly_membership_break_even": monthly_membership_break_even,
    # party
    "list_party_packages": list_party_packages,
    "get_party_package": get_party_package,
    "find_best_party_package": find_best_party_package,
    "estimate_party_total": estimate_party_total,
    "list_party_addons": list_party_addons,
    "get_party_addon": get_party_addon,
    # promotions
    "list_active_promotions": list_active_promotions,
    "get_promotion_by_code": get_promotion_by_code,
    # hours / location / fees / events / jobs
    "get_hours": get_hours,
    "is_open_now": is_open_now,
    "get_location": get_location,
    "get_fee": get_fee,
    "list_upcoming_events": list_upcoming_events,
    "list_open_positions": list_open_positions,
    # faqs / announcements
    "search_faqs": search_faqs,
    "list_active_announcements": list_active_announcements,
    # semantic
    "search_knowledge_base": search_knowledge_base,
}


TOOL_SCHEMAS: list[dict] = [
    # ---- tickets ----
    {"type": "function", "function": {
        "name": "list_tickets",
        "description": "List active open-play admission tickets. For 'cheapest ticket' use sort='price_asc' with limit=1 and NO price filter. For 'most expensive' use sort='price_desc' with limit=1. Only pass min_price/max_price if the user gave an explicit dollar budget (e.g. 'under $40'). Only pass child_count for an exact bundle size match.",
        "parameters": {"type": "object", "properties": {
            "min_price": {"type": "number", "description": "ONLY if user gave a lower bound."},
            "max_price": {"type": "number", "description": "ONLY if user gave a max budget."},
            "child_count": {"type": "integer", "description": "Exact bundle size (1=single, 2=2-sibling, etc.) — omit unless user specified an exact count."},
            "sort": {"type": "string", "enum": ["price_asc", "price_desc", "name"]},
            "limit": {"type": "integer", "default": 20},
        }}}},
    {"type": "function", "function": {
        "name": "get_ticket",
        "description": "Look up a single ticket by name (e.g. 'Single Child Admission', '3 Siblings Bundle').",
        "parameters": {"type": "object", "required": ["name"],
                       "properties": {"name": {"type": "string"}}}}},
    {"type": "function", "function": {
        "name": "find_best_ticket_for",
        "description": "Recommend the cheapest ticket option for a specified number of children. Picks an exact bundle if one exists; otherwise the next-size-up bundle, or the largest bundle plus extra-child admissions. Use this whenever a customer asks 'how much for N kids' or 'best deal for N children'.",
        "parameters": {"type": "object", "required": ["num_children"],
                       "properties": {"num_children": {"type": "integer", "minimum": 1}}}}},
    {"type": "function", "function": {
        "name": "estimate_admission_total",
        "description": "Total cost for a family open-play visit: best ticket for the kids + extra adult admissions + optional grip socks. Use for 'total cost for 4 kids and 2 adults' style questions.",
        "parameters": {"type": "object", "required": ["num_children"],
                       "properties": {
                           "num_children": {"type": "integer", "minimum": 1},
                           "num_adults": {"type": "integer", "minimum": 0, "default": 0},
                           "with_grip_socks": {"type": "boolean", "default": False},
                       }}}},
    # ---- memberships ----
    {"type": "function", "function": {
        "name": "list_memberships",
        "description": "List active monthly membership plans with active promotional pricing inlined. For 'cheapest plan' use sort='price_asc', limit=1, and NO max_price. For 'most expensive' use sort='price_desc', limit=1. Only pass max_price if the user gave an explicit budget (e.g. 'under $500'). Only pass covers_children/covers_adults if the user mentioned a family size.",
        "parameters": {"type": "object", "properties": {
            "covers_children": {"type": "integer", "description": "ONLY if user specified family size."},
            "covers_adults":   {"type": "integer", "description": "ONLY if user specified adult count."},
            "max_price": {"type": "number", "description": "ONLY if user gave an explicit budget."},
            "sort": {"type": "string", "enum": ["price_asc", "price_desc"]},
            "limit": {"type": "integer", "default": 20},
        }}}},
    {"type": "function", "function": {
        "name": "get_membership",
        "description": "Look up a single membership plan by name (e.g. 'Mini Plan', 'Super Plan', 'Mega Plan').",
        "parameters": {"type": "object", "required": ["name"],
                       "properties": {"name": {"type": "string"}}}}},
    {"type": "function", "function": {
        "name": "find_best_membership_for",
        "description": "Cheapest active plan that covers the requested family size, plus up to 2 step-up alternatives.",
        "parameters": {"type": "object", "required": ["num_children"],
                       "properties": {
                           "num_children": {"type": "integer", "minimum": 1},
                           "num_adults":   {"type": "integer", "minimum": 0, "default": 0},
                       }}}},
    {"type": "function", "function": {
        "name": "compare_memberships",
        "description": "Compare two or more membership plans side-by-side (price, coverage, benefits).",
        "parameters": {"type": "object", "required": ["names"],
                       "properties": {"names": {"type": "array", "items": {"type": "string"}, "minItems": 2}}}}},
    {"type": "function", "function": {
        "name": "monthly_membership_break_even",
        "description": "For a given family size, return how many monthly visits it takes for the cheapest covering plan to beat paying per-visit. Use when a customer asks 'is membership worth it?'.",
        "parameters": {"type": "object", "required": ["num_children"],
                       "properties": {
                           "num_children": {"type": "integer", "minimum": 1},
                           "num_adults":   {"type": "integer", "minimum": 0, "default": 0},
                       }}}},
    # ---- party ----
    {"type": "function", "function": {
        "name": "list_party_packages",
        "description": "List active birthday party packages. For 'cheapest package' use sort='price_asc', limit=1, NO max_price. For 'most expensive' use sort='price_desc', limit=1. Only pass max_price if the user gave an explicit budget. Only pass includes_food/includes_decor if the user requires that feature.",
        "parameters": {"type": "object", "properties": {
            "includes_food":  {"type": "boolean", "description": "ONLY if user requires food included."},
            "includes_decor": {"type": "boolean", "description": "ONLY if user requires decorations included."},
            "max_price": {"type": "number", "description": "ONLY if user gave an explicit budget."},
            "sort": {"type": "string", "enum": ["price_asc", "price_desc"]},
            "limit": {"type": "integer", "default": 20},
        }}}},
    {"type": "function", "function": {
        "name": "get_party_package",
        "description": "Look up a single party package by name ('Mini Fun', 'Super Fun', 'Mega Fun').",
        "parameters": {"type": "object", "required": ["name"],
                       "properties": {"name": {"type": "string"}}}}},
    {"type": "function", "function": {
        "name": "find_best_party_package",
        "description": "Recommend the cheapest party package matching given needs (kid count, food/decor required, budget).",
        "parameters": {"type": "object", "required": ["num_kids"],
                       "properties": {
                           "num_kids":     {"type": "integer", "minimum": 1},
                           "needs_food":   {"type": "boolean", "default": False},
                           "needs_decor":  {"type": "boolean", "default": False},
                           "budget":       {"type": "number"},
                       }}}},
    {"type": "function", "function": {
        "name": "estimate_party_total",
        "description": "Full party cost breakdown: base package + extra children + extra adults + optional add-ons (extra hours, face painting, photo/video) + cleaning fee, with optional promo code applied. Returns subtotal, total, and deposit due. Use this for 'how much for a party of N kids?' questions.",
        "parameters": {"type": "object", "required": ["package_name", "num_kids"],
                       "properties": {
                           "package_name": {"type": "string"},
                           "num_kids":     {"type": "integer", "minimum": 1},
                           "num_adults":   {"type": "integer", "minimum": 0, "default": 0},
                           "extra_hours":  {"type": "integer", "minimum": 0, "default": 0},
                           "addons":       {"type": "array", "items": {"type": "string"},
                                            "description": "Add-on codes or labels: face_painting, photo_video, etc."},
                           "promo_code":   {"type": "string"},
                       }}}},
    {"type": "function", "function": {
        "name": "list_party_addons",
        "description": "List all available party add-ons (Extra Hour, Face Painting, Photo & Video, etc.).",
        "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {
        "name": "get_party_addon",
        "description": "Look up a single add-on by code or label.",
        "parameters": {"type": "object", "required": ["code_or_label"],
                       "properties": {"code_or_label": {"type": "string"}}}}},
    # ---- promotions ----
    {"type": "function", "function": {
        "name": "list_active_promotions",
        "description": "List currently-active promotions: discount codes, product-specific promos (e.g. membership discounts), and headline offers. Filter by applies_to (e.g. 'party_booking', 'membership') or kind ('code', 'product', 'offer').",
        "parameters": {"type": "object", "properties": {
            "applies_to": {"type": "string"},
            "kind": {"type": "string", "enum": ["code", "product", "offer"]},
        }}}},
    {"type": "function", "function": {
        "name": "get_promotion_by_code",
        "description": "Look up a discount code (e.g. MAY10). Returns the discount, scope, expiration, and whether it is currently active/expired/pending.",
        "parameters": {"type": "object", "required": ["code"],
                       "properties": {"code": {"type": "string"}}}}},
    # ---- hours / location / fees / events / jobs ----
    {"type": "function", "function": {
        "name": "get_hours",
        "description": "Hours of operation. Pass day='Monday'..'Sunday' or 'today'/'tomorrow' for a single day, otherwise returns the full week.",
        "parameters": {"type": "object", "properties": {
            "day": {"type": "string"},
            "location": {"type": "string"},
        }}}},
    {"type": "function", "function": {
        "name": "is_open_now",
        "description": "Returns whether the play center is open right now, and if not, when it next opens. Uses America/New_York time.",
        "parameters": {"type": "object", "properties": {"location": {"type": "string"}}}}},
    {"type": "function", "function": {
        "name": "get_location",
        "description": "Playfunia location detail (address, phone, email).",
        "parameters": {"type": "object", "properties": {"name": {"type": "string"}}}}},
    {"type": "function", "function": {
        "name": "get_fee",
        "description": "Look up one customer-facing fee by key (cleaning_fee, deposit_percentage, grip_socks_price, extra_adult_admission_price, extra_child_admission, sibling_discount_rate, single_admission_price).",
        "parameters": {"type": "object", "required": ["key"],
                       "properties": {"key": {"type": "string"}}}}},
    {"type": "function", "function": {
        "name": "list_upcoming_events",
        "description": "List upcoming/in-progress events (those whose end_date >= today).",
        "parameters": {"type": "object", "properties": {"limit": {"type": "integer", "default": 10}}}}},
    {"type": "function", "function": {
        "name": "list_open_positions",
        "description": "Currently open job postings at Playfunia. Optional filters by department or employment type.",
        "parameters": {"type": "object", "properties": {
            "department": {"type": "string"},
            "employment_type": {"type": "string"},
        }}}},
    # ---- faqs / announcements ----
    {"type": "function", "function": {
        "name": "search_faqs",
        "description": "Search the FAQ table for an answer. Pass `query` with 1-3 key terms from the user's question — the search does an ILIKE match on both question and answer text. DO NOT pass `category` unless the user explicitly scoped their question to one of {party, admission, membership, general}; the default (no category) searches across all FAQs. Prefer this tool over search_knowledge_base for policy/process questions (waivers, refunds, decorations, food rules, age limits, payment methods, cancellation, booking lead time).",
        "parameters": {"type": "object", "properties": {
            "query":    {"type": "string", "description": "1-3 key terms from the user's question (e.g. 'waiver', 'decorations', 'cancellation')."},
            "category": {"type": "string", "enum": ["general", "party", "admission", "membership"],
                          "description": "ONLY pass when user clearly scoped to one of those areas. When in doubt, omit."},
            "limit":    {"type": "integer", "default": 10},
        }, "required": ["query"]}}},
    {"type": "function", "function": {
        "name": "list_active_announcements",
        "description": "Current announcements / news items (e.g. seasonal programs, special bonuses, recurring promotions). Filtered to ones that are published and not yet expired.",
        "parameters": {"type": "object", "properties": {"limit": {"type": "integer", "default": 10}}}}},
    # ---- semantic ----
    {"type": "function", "function": {
        "name": "search_knowledge_base",
        "description": "Free-form semantic search over the curated Playfunia knowledge base text. Use as a fallback ONLY when no structured tool above fits the question — e.g. open-ended policy or descriptive questions. Returns 5 relevant passages.",
        "parameters": {"type": "object", "required": ["query"],
                       "properties": {
                           "query": {"type": "string"},
                           "k": {"type": "integer", "default": 5},
                       }}}},
]

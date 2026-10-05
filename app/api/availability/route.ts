import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBarber } from "@/config/site";
import { findService } from "@/lib/services";
import { generateSlots, shouldHidePast, type Interval } from "@/lib/slots";
import { toMinutes } from "@/lib/time";

export const dynamic = "force-dynamic";

/** "HH:MM:SS" ou "HH:MM" -> minutes depuis minuit. */
function timeToMin(t: string): number {
  return toMinutes(t.slice(0, 5));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const barber = searchParams.get("barber") || "";
  const date = searchParams.get("date") || "";
  const serviceId = searchParams.get("service") || "";

  if (!getBarber(barber)) {
    return NextResponse.json({ message: "Barber inconnu" }, { status: 400 });
  }
  const service = await findService(serviceId);
  if (!service) {
    return NextResponse.json({ message: "Service inconnu" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ message: "Date invalide" }, { status: 400 });
  }

  try {
    const sb = supabaseAdmin();

    const [bookingsRes, blockedRes] = await Promise.all([
      sb
        .from("bookings")
        .select("start_time, duration_min")
        .eq("barber", barber)
        .eq("date", date)
        .eq("status", "confirmed"),
      sb
        .from("blocked_slots")
        .select("start_time, end_time")
        .eq("barber", barber)
        .eq("date", date),
    ]);

    if (bookingsRes.error) throw bookingsRes.error;
    if (blockedRes.error) throw blockedRes.error;

    const busy: Interval[] = [];
    for (const b of bookingsRes.data || []) {
      const startMin = timeToMin(b.start_time as string);
      busy.push({ startMin, endMin: startMin + (b.duration_min as number) });
    }
    for (const bl of blockedRes.data || []) {
      busy.push({
        startMin: timeToMin(bl.start_time as string),
        endMin: timeToMin(bl.end_time as string),
      });
    }

    const slots = generateSlots(
      date,
      service.durationMin,
      busy,
      shouldHidePast(date)
    );

    return NextResponse.json({ slots });
  } catch (e) {
    console.error("availability error", e);
    return NextResponse.json(
      { message: "Erreur serveur" },
      { status: 500 }
    );
  }
}

import cron from "node-schedule";
import log from "./log";
import ResyService from "./controllers/ResyService";
import TextService from "./controllers/TextService";
import type { VenueToWatch } from "./controllers/VenuesService";
import VenuesService from "./controllers/VenuesService";
import dayjs from "dayjs";
import { EnhancedSlot, Type } from "./types/find";

const email = process.env.RESY_EMAIL!;
const password = process.env.RESY_PASSWORD!;

const service = new ResyService({
  email,
  password,
});

console.log("Using email " + email);

const textController = new TextService();
const venuesService = new VenuesService();

const outdoors = "Outdoor";
const patio = "Patio";

const no_banned_words = async (text: string) => {
  return !(text.toLowerCase().includes("outdoor") || text.toLowerCase().includes("patio"));
}

const parsePossibleSlots = async (
  venue: VenueToWatch,
  possibleSlots: EnhancedSlot[]
) => {
  const dateToCheck = possibleSlots[0].date.start;
  log.info(
    `Found ${possibleSlots.length} valid open slots on ${dateToCheck} for ${venue.name}`
  );
  if (venue.preferredTime) {
    const date = possibleSlots[0].start!.format("YYYY-MM-DD");
    const preferredTime = dayjs(`${date} ${venue.preferredTime}`);
    possibleSlots.forEach((slot) => {
      slot.diff = Math.abs(slot.start!.diff(preferredTime));
    });
    possibleSlots.sort((slotA, slotB) => {
      return slotA.diff - slotB.diff;
    });
  }
  const timeToBook = possibleSlots[0];
  log.info(`Found best time to book - ${timeToBook.date.start}`);
  if (!venue.notified) {
    await textController.sendText(
      `There is availability at ${venue.name} at ${timeToBook.date.start}`
    );
    venue.notified = true;
    await venuesService.updateWatchedVenue(venue);
  }
  if (venue.shouldBook) {
    const userDetails = await service.getUser();
    const configId = timeToBook.config.token;
    const timeDetails = await service.details({
      commit: 1,
      config_id: configId,
      party_size: venue.partySize ?? 2,
      day: (dateToCheck || "").split(" ")[0] || timeToBook.shift.day,
    });
    const bookingResponse = await service.book({
      book_token: timeDetails!.data!.book_token!.value!,
      struct_payment_method: `{"id":${userDetails.data.payment_methods[0].id}}`,
      source_id: "resy.com-venue-details",
    });

    venue.reservationDetails = bookingResponse.data;
    log.info(`Successfully booked at ${venue.name}`);
    await venuesService.updateWatchedVenue(venue);
  }
};
const refreshAvailabilityForVenue = async (venue: VenueToWatch) => {
  try {
    log.info(`Refreshing availability for ${venue.name}`);
    const availableDates = await service.getAvailableDatesForVenue(
      venue.id,
      venue.partySize
    );
    if (!availableDates.length) {
      return;
    }
    for (const dateToCheck of availableDates) {
      //if dateToCheck.date in list of dates
      if (venue.allowedDates) {
        if (venue.allowedDates.indexOf(dateToCheck.date) == -1) {
          log.info("skipping available date because of allowed dates flag");
          continue;
        }
      }

      const slots = (await service.getAvailableTimesForVenueAndDate(
        venue.id,
        dateToCheck.date,
        venue.partySize
      )) as EnhancedSlot[];

      const possibleSlots = slots.filter((slot) => {
        const table_type = slot.config.type.toString()
        const start = dayjs(slot.date.start);
        const minTime = dayjs(`${start.format("YYYY-MM-DD")} ${venue.minTime}`);
        const maxTime = dayjs(`${start.format("YYYY-MM-DD")} ${venue.maxTime}`);
        slot.start = start;
        return start >= minTime && start <= maxTime && no_banned_words(table_type);
      });


      // for (const slot of possibleSlots) {
      //   const wtf = slot.config.type.toString();
      //   if (await no_banned_words(wtf)) {
      //     console.log(slot.config.type);
      //   }
        
      // }

      // // const possibleSlots = possibleSlots.filter((slot) => {
      // //   const seating = slot.config.type == Type.DiningRoom
      // // });

      if (possibleSlots.length) {
        await parsePossibleSlots(venue, possibleSlots);
        return;
      }
    }
    log.debug(`Found no valid slots for ${venue.name}`);
  } catch (e) {
    console.error(e);
  }
};

const refreshAvailability = async () => {
  log.info("Finding reservations");

  await venuesService.init();
  const venuesToSearchFor = await venuesService.getWatchedVenues();
  // You get more availability if you have an amex card and you log in

  for (const venue of venuesToSearchFor) {
    await refreshAvailabilityForVenue(venue);
  }
  await venuesService.save();
  log.info("Finished finding reservations");
};

const regenerateHeaders = async () => {
  try {
    if (!email || !password) {
      log.warn(
        "Email or password not set, did you forget to set the environment variables?"
      );
      return;
    }
    await service.generateHeadersAndLogin();
  } catch (e) {
    log.error(e);
    log.error("Error regenerating headers and logging in");
    process.exit(1);
  }
};

const singleReserve = async() => {
  regenerateHeaders().then(async () => {
    await refreshAvailability();
  });
}

const burstReserve = async () => {
  let target_hour = 13;
  let target_minute = 59;
  let target_second = 59;
  
  while (true) {
    let dateTime = new Date();
    let hour = dateTime.getHours();
    let minute = dateTime.getMinutes();
    let second = dateTime.getSeconds();
  
    console.log(`current: ${hour}:${minute}:${second} | target: ${target_hour}:${target_minute}:${target_second}`);
  
    if (hour == target_hour && minute == target_minute && second == target_second) {
      regenerateHeaders().then(async () => {              
          await refreshAvailability();
          await refreshAvailability();
          await refreshAvailability();
          await refreshAvailability();
          await refreshAvailability();
          await refreshAvailability();
          await refreshAvailability();
          await refreshAvailability();
          await refreshAvailability();
          await refreshAvailability();
          await refreshAvailability();
          await refreshAvailability();
          await refreshAvailability();
      });
      break;
    };
  }  
}

burstReserve();

const Blinkt = require("node-blinkt");
require("isomorphic-fetch");

lights = new Blinkt();

// Reset the lights
lights.setup();
triggerLights()

function triggerLights(amount, r = 0, g = 0, b = 0, brightness = 0.1) {
  lights.clearAll();
  for (let i = 0; i < amount; i++) {
    lights.setPixel(i, r, g, b, brightness);
  }
  lights.sendUpdate();
}

// Search for RLB numbers here: https://till.mabe.at/rbl/
const STATION_RLB = 206; // 37 in direction Schottentor
const { API_KEY } = process.env;

const GREEN_UNTIL_TIME = 2 * 60 * 1000; // 2 minutes
const YELLOW_UNTIL_TIME = 5 * 60 * 1000; // 5 minutes
const RED_UNTIL_TIME = 7 * 60 * 1000; // 7 minutes

/**
 * Returns an array of milliseconds for the upcoming fares of a line.
 */
function parseFares({ departures }) {
  const now = Date.now();

  return departures.departure.map(({ departureTime }) => {
    // We try the timeReal first if it"s present, otherwise we fall
    // back to timePlanned
    const arrival = new Date(
      departureTime.timeReal || departureTime.timePlanned
    );
    return arrival - now;
  });
}

// Returns the percentage (0..1) until the next step. E.g. when the light
// is green for one minute and will be only one more, it will return 0.5.
function percentageToNextStep(fare) {
  let durationOfStep = 0;
  let durationInStep = 0;

  if (fare < YELLOW_UNTIL_TIME) {
    durationOfStep = YELLOW_UNTIL_TIME - GREEN_UNTIL_TIME;
    durationInStep = YELLOW_UNTIL_TIME - fare;
  } else if (fare < RED_UNTIL_TIME) {
    durationOfStep = RED_UNTIL_TIME - YELLOW_UNTIL_TIME;
    durationInStep = RED_UNTIL_TIME - fare;
  } else {
    // The light is red, we have no percentage in this case
    return 0;
  }

  return durationInStep / durationOfStep;
}

/**
 * Outputs the current state based on the flares array. Will return the
 * time when the next poll should happen (in ms)
 */
function interpretFares(fares) {
  // We truncate all fares that are neared then GREEN_UNTIL_TIME
  const remainingFares = fares.filter(ms => ms > GREEN_UNTIL_TIME);

  if (remainingFares.length == 0) {
    console.log("NO_MORE_FARES");
    triggerLights(0);

    // We try again in 10 minutes
    return 10 * 60 * 1000; // 10 minutes
  } else {
    const nextFare = remainingFares[0];
    console.log("next fare in:", nextFare / 1000 / 60, "minutes");

    const progress = percentageToNextStep(nextFare);

    // Number of lights is based on the progress. All (8) lights for 0%
    const numberOfLights = Math.max(Math.ceil((1 - progress) * 8), 8);

    if (nextFare < YELLOW_UNTIL_TIME) {
      console.log("GREEN");
      triggerLights(numberOfLights, 0, 80, 0);
    } else if (nextFare < RED_UNTIL_TIME) {
      console.log("YELLOW");
      triggerLights(numberOfLights, 255, 255, 0);
    } else {
      console.log("RED");
      triggerLights(numberOfLights, 255, 0, 0);
    }

    // We always poll again in 30 seconds
    // @TODO interpret the fare value and find a suitable time
    return 30 * 1000;
  }
}

function poll() {
  fetch(
    `https://www.wienerlinien.at/ogd_realtime/monitor?` +
      `sender=${API_KEY}&rbl=${STATION_RLB}`
  )
    .then(r => r.json())
    .then(({ data: { monitors } }) => {
      const station = monitors[0];
      const line = station.lines[0];
      const fares = parseFares(line);
      const nextPoll = interpretFares(fares);

      setTimeout(poll, nextPoll);
    });
}

poll();

// Attach exit handler
process.on("SIGINT", () => {
  triggerLights();
  process.exit(0);
});

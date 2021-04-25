function micfitController({
  monitor,
  speedCallback,
  tick,
  speedTime = 3000,
  stopTime = 2000,
  tolerance = 1,
  samplingInterval = 1,
}) {
  const tickCounter = approxFrequency();
  const thresholdHitThrottled = throttle(100, () => {
    tick();
    tickCounter.add();
  });
  setInterval(() => speedCallback(tickCounter.get()), 200);

  function gotStream(stream) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContext();
    const mediaStreamSource = audioContext.createMediaStreamSource(stream);

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 32;

    var dataArray = new Uint8Array(analyser.frequencyBinCount);

    mediaStreamSource.connect(analyser);

    const sample = adaptiveThreshold(thresholdHitThrottled);

    function loop() {
      analyser.getByteTimeDomainData(dataArray);
      const raw = dataArray.map((i) => Math.abs(i - 128.0));
      const results = raw.map(sample);
      monitor({ raw, results });
      setTimeout(() => requestAnimationFrame(loop), samplingInterval);
    }
    loop();
  }

  function throttle(time, cb) {
    let throttling = false;
    return () => {
      if (!throttling) {
        throttling = true;
        setTimeout(() => {
          throttling = false;
        }, time);
        cb();
      }
    };
  }
  function countOverTime(time = 20000) {
    const history = [];
    function update() {
      while (Date.now() - history[0] > time) {
        history.shift();
      }
    }
    return {
      add() {
        history.push(Date.now());
        update();
      },
      get() {
        update();
        return (history.length / time) * 1000;
      },
    };
  }
  function approxFrequency() {
    let previous = Date.now();
    let current = Date.now();
    return {
      add() {
        previous = current;
        current = Date.now();
      },
      get() {
        const delta = current - previous;
        if (Date.now() - current > stopTime) {
          return 0;
        }
        return 1000 / (current - previous);
      },
    };
  }

  function rollingAverage(samples = 100) {
    const avgHistory = [];
    let avgSum = 0.0;
    return {
      full() {
        return avgHistory.length >= samples;
      },
      add(value) {
        avgHistory.push(value);
        avgSum += value;
        if (avgHistory.length > samples) {
          const bye = avgHistory.shift();
          avgSum -= bye;
        }
      },
      get() {
        return avgSum / avgHistory.length;
      },
    };
  }

  function recentMinMax(time) {
    let min = Infinity,
      max = -Infinity;
    const aggregate = { min: rollingAverage(10), max: rollingAverage(10) };
    let shifted = false;
    const timer = setInterval(() => {
      shifted = true;
      aggregate.max.add(max);
      aggregate.min.add(min);
      min = Infinity;
      max = -Infinity;
    }, time);

    function get() {
      return shifted
        ? { min: aggregate.min.get(), max: aggregate.max.get() }
        : { min, max };
    }
    return {
      timer,
      add(value) {
        if (value > max) {
          max = value;
        }
        if (value < min) {
          min = value;
        }
      },
      get,
      getSpan() {
        const span = get();
        return span.max - span.min;
      },
    };
  }

  function adaptiveThreshold(hit) {
    const average = rollingAverage(500);
    const minmax = recentMinMax(200);

    return (value) => {
      average.add(value);
      minmax.add(value);
      const avg = average.get();
      const silenceThreshold = minmax.get().min + 4;

      if (
        average.full() &&
        Math.abs(avg - value) - silenceThreshold >
          minmax.getSpan() / (2.0 * tolerance)
      ) {
        hit();
      }

      return minmax.getSpan();
    };
  }

  let installed = false;

  return {
    install() {
      if (installed) {
        throw Error(
          "controller already installed. Create a new instance if you need another one"
        );
      }
      installed = true;
      return navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then(gotStream);
    },
    getSpeed: tickCounter.get,
  };
}

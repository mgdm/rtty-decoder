import * as goertzel from "goertzel";

const SPACE_FREQ = 2295;
const MARK_FREQ = 2125;

const EXAMPLE_SOURCE = "output.wav";

const LETTERS = {
    '00000': "\0",
    '00100': ' ',
    '10111': 'Q',
    '10011': 'W',
    '00001': 'E',
    '01010': 'R',
    '10000': 'T',
    '10101': 'Y',
    '00111': 'U',
    '00110': 'I',
    '11000': 'O',
    '10110': 'P',
    '00011': 'A',
    '00101': 'S',
    '01001': 'D',
    '01101': 'F',
    '11010': 'G',
    '10100': 'H',
    '01011': 'J',
    '01111': 'K',
    '10010': 'L',
    '10001': 'Z',
    '11101': 'X',
    '01110': 'C',
    '11110': 'V',
    '11001': 'B',
    '01100': 'N',
    '11100': 'M',
    '01000': "\r",
    '00010': "\n",
};


async function getInput(url) {
    return fetch(EXAMPLE_SOURCE)
        .then(response => response.arrayBuffer());
}

function detectBits(samples) {
    const markDecoder = goertzel({
        targetFrequency: MARK_FREQ,
        sampleRate: samples.sampleRate,
        samplesPerFrame: 128
    });

    const spaceDecoder = goertzel({
        targetFrequency: SPACE_FREQ,
        sampleRate: samples.sampleRate,
        samplesPerFrame: 128
    });

    const channelData = samples.getChannelData(0);
    const result = [];

    for (let i = 0; i < channelData.length; i += 128) {
        const data = channelData.slice(i, i + 128);
        result.push([markDecoder(data), spaceDecoder(data)]);
    }

    return result;
}

function goetzelBitstream(bits) {
    let result = [];

    for (let i = 0; i < bits.length; i++) {
        let [mark, space] = bits[i];
        let goertzelBit = 0;

        if (mark == false && space == false) {
            goertzelBit = 0;
            result.push(goertzelBit);
            continue;
        }

        if (mark) {
            goertzelBit = 1;
        } else {
            goertzelBit = 0;
        }

        result.push(goertzelBit);
    }

    return result;
}

function baudotBitstream(goetzelBits) {
    let baudotBits = [];

    console.log(goetzelBits.toString());

    /* This is largely inspired by 
     * https://files.tapr.org/meetings/DCC_2014/DCC2014-Radioteletype-Over-Sampling-Decoder-K0JJR.pdf
     */

    let i = 0;
    /* Look for a mark */
    while (goetzelBits[i] === 0) {
        i++;
    }

    /* We've found a mark, now let's look for the space */
    while (goetzelBits[i] === 1) {
        i++;
    }

    i++;
    /* Hopefully by now we are synced up, start the main loop */

    for (let jump = 7; i < goetzelBits.length; i += jump) {
        /*
            The decoder adds up the second, third, fourth, fifth, and sixth Goertzel bits of each RTTY Baudot bit.
            If those five Goertzel bits add up to zero, one, or two, the RTTY Baudot bit is declared to be a Space.
            If those five Goertzel bits add up to three, four, or five, the RTTY Baudot bit is declared to be a Mark.
        */

        const bits = goetzelBits.slice(i, i + jump);
        /* Start from the second bit, grab the next five */
        const subBits = bits.slice(1, 6);
        // console.log("Bits: " + bits.toString());
        // console.log("Subbits: " + subBits.toString());
        const total = subBits.reduce((prev, curr) => prev + curr, 0);

        let result = 0;
        if (total >= 3) {
            result = 1;
        }

        baudotBits.push(result);

        /* 
            With an over-sampling rate of 7.6 Goertzel bits during the duration of a Mark or Space tone,
            accurate timing can be achieved by alternating between seven and eight Goertzel bits for each RTTY
            Baudot bit, so that the average is approximately 7.6
        */
        jump = (jump == 7 ? 8 : 7);
    }

    return baudotBits;
}

function decodeGroup(group) {
    let baudotBits = group.slice(1, 6);
    let str = baudotBits.reduce((prev, curr) => prev + curr.toString(), '');

    if (LETTERS.hasOwnProperty(str)) {
        return LETTERS[str];
    }

    return ' ';
}

async function main() {
    const ctx = new window.AudioContext();
    const input = await getInput(EXAMPLE_SOURCE);

    const audio = await ctx.decodeAudioData(input);
    const bitStream = detectBits(audio);
    const goetzelBits = goetzelBitstream(bitStream);
    const baudotBits = baudotBitstream(goetzelBits);

    let bitGroups = [];
    let skip = 8;
    for (let i = 0; i < baudotBits.length; i += skip) {
        bitGroups.push(baudotBits.slice(i, i + skip));
    }

    let chars = bitGroups.map(decodeGroup).join("");

    document.getElementById("stats").innerText = `Decoded ${chars.length} characters from ${goetzelBits.length} samples and ${baudotBits.length} detected bits`;
    document.getElementById("output").innerText = chars;
}

main();
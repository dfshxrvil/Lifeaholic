import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const output = resolve('assets/sounds/chime.wav');
const sampleRate = 44100;
const duration = 0.34;
const sampleCount = Math.floor(sampleRate * duration);
const dataSize = sampleCount * 2;
const buffer = Buffer.alloc(44 + dataSize);

buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + dataSize, 4);
buffer.write('WAVE', 8);
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(1, 22);
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(sampleRate * 2, 28);
buffer.writeUInt16LE(2, 32);
buffer.writeUInt16LE(16, 34);
buffer.write('data', 36);
buffer.writeUInt32LE(dataSize, 40);

for (let index = 0; index < sampleCount; index += 1) {
  const time = index / sampleRate;
  const attack = Math.min(1, time / 0.012);
  const release = Math.pow(Math.max(0, 1 - time / duration), 2.6);
  const secondTone = time > 0.075 ? Math.sin(2 * Math.PI * 1318.51 * (time - 0.075)) * 0.48 : 0;
  const firstTone = Math.sin(2 * Math.PI * 880 * time) * 0.52;
  const shimmer = Math.sin(2 * Math.PI * 1760 * time) * 0.08;
  const sample = Math.max(-1, Math.min(1, (firstTone + secondTone + shimmer) * attack * release));
  buffer.writeInt16LE(Math.round(sample * 32767 * 0.55), 44 + index * 2);
}

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, buffer);
console.log(`Generated ${output}`);

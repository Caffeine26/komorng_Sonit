// adminSoundUtils.ts
export type SoundType = 'order' | 'update';

export const playAdminSound = (type: SoundType) => {
  const path = type === 'order' ? '/sound/order.mp3' : '/sound/update.mp3';
  const audio = new Audio(path);
  audio.play().catch(() => {
    // silence any errors (e.g., user muted)
  });
};

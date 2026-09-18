// Для другого логотипа замените public/brand/logo.png или поменяйте путь здесь.
export const site = {
  name: 'Чайка Обеды',
  mealPrice: 550,
  // Monday starting the first week of the repeating four-week menu.
  menuCycleStartsOn: '2026-09-21',
  logo: '/brand/logo.png',
  cities: ['Ялта', 'Севастополь', 'Симферополь'],
  deliveryFee: 100,
  deliverySlots: ['12:00–13:00', '13:00–14:00'],
  weeklyGift: {
    requiredDays: 5,
    name: 'Выпечка в подарок',
    image: '/images/weekly-gift.webp',
    imageAlt: 'Слоёная выпечка с кремом и попкорном',
  },
  demo: true,
} as const;

export type City = (typeof site.cities)[number];

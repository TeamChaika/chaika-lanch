export interface Dish {
  name: string;
  weight: number;
}

export interface Meal {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  tag: string;
  calories: number;
  dishes: Dish[];
  ingredients: string;
  allergens: string;
}

// Демонстрационное меню. Цены, составы и фото редактируются здесь.
export const meals: Meal[] = [
  {
    id: 'homestyle', name: 'Домашний', description: 'Курица с пюре, суп с лапшой и свежий салат',
    price: 450, image: '/images/homestyle.png', tag: 'Любимая классика', calories: 680,
    dishes: [{ name: 'Куриный суп с лапшой', weight: 300 }, { name: 'Курица с картофельным пюре', weight: 350 }, { name: 'Салат из капусты и огурца', weight: 100 }],
    ingredients: 'Курица, картофель, молоко, сливочное масло, пшеничная лапша, морковь, лук, капуста, огурец, зелень, растительное масло, соль.',
    allergens: 'Молоко, пшеница (глютен). На кухне используются яйца, рыба и орехи.',
  },
  {
    id: 'classic', name: 'Классический', description: 'Говядина с гречкой, борщ и овощной салат',
    price: 500, image: '/images/classic.png', tag: 'Сытный обед', calories: 720,
    dishes: [{ name: 'Борщ со сметаной', weight: 300 }, { name: 'Говядина с гречкой', weight: 350 }, { name: 'Салат из помидоров и огурцов', weight: 100 }],
    ingredients: 'Говядина, гречка, свёкла, капуста, картофель, морковь, лук, томаты, огурец, сметана, зелень, растительное масло, соль.',
    allergens: 'Молоко. На кухне используются пшеница, яйца, рыба и орехи.',
  },
  {
    id: 'special', name: 'Особенный', description: 'Рыба с рисом, тыквенный суп и зелёный салат',
    price: 550, image: '/images/special.png', tag: 'Что-нибудь полегче', calories: 610,
    dishes: [{ name: 'Тыквенный крем-суп', weight: 300 }, { name: 'Запечённая рыба с рисом и брокколи', weight: 350 }, { name: 'Зелёный салат с черри', weight: 100 }],
    ingredients: 'Белая рыба, рис, брокколи, тыква, сливки, лук, салатные листья, томаты черри, лимон, растительное масло, соль.',
    allergens: 'Рыба, молоко. На кухне используются пшеница, яйца и орехи.',
  },
  {
    id: 'turkey-bulgur', name: 'Индейка с булгуром', description: 'Запечённая индейка, зелёный суп и свекольный салат',
    price: 450, image: '/images/turkey-bulgur.png', tag: 'Вторник по-домашнему', calories: 650,
    dishes: [{ name: 'Щавелевый суп с яйцом', weight: 300 }, { name: 'Индейка с булгуром и морковью', weight: 350 }, { name: 'Свёкла с грецким орехом', weight: 100 }],
    ingredients: 'Индейка, булгур, морковь, щавель, яйцо, картофель, лук, свёкла, грецкий орех, растительное масло, соль.',
    allergens: 'Пшеница (глютен), яйца, грецкие орехи. На кухне используются молоко и рыба.',
  },
  {
    id: 'meatballs-pasta', name: 'Тефтели с пастой', description: 'Тефтели в томатном соусе, грибной суп и морковь с яблоком',
    price: 500, image: '/images/meatballs-pasta.png', tag: 'Любимый вкус', calories: 740,
    dishes: [{ name: 'Грибной крем-суп', weight: 300 }, { name: 'Говяжьи тефтели с пастой', weight: 350 }, { name: 'Салат из моркови и яблока', weight: 100 }],
    ingredients: 'Говядина, пшеничная паста, томаты, лук, яйцо, шампиньоны, сливки, картофель, морковь, яблоко, растительное масло, соль.',
    allergens: 'Пшеница (глютен), яйца, молоко. На кухне используются рыба и орехи.',
  },
  {
    id: 'pork-potatoes', name: 'Жаркое с картофелем', description: 'Запечённая свинина, гороховый суп и хрустящий салат',
    price: 550, image: '/images/pork-potatoes.png', tag: 'Сытный вторник', calories: 790,
    dishes: [{ name: 'Гороховый суп', weight: 300 }, { name: 'Свинина с картофелем по-деревенски', weight: 350 }, { name: 'Салат из капусты и сладкого перца', weight: 100 }],
    ingredients: 'Свинина, картофель, горох, морковь, лук, капуста, сладкий перец, зелень, растительное масло, соль.',
    allergens: 'На кухне используются молоко, пшеница, яйца, рыба и орехи.',
  },
  {
    id: 'chicken-plov', name: 'Плов с курицей', description: 'Рассыпчатый плов, чечевичный суп и томаты с зеленью',
    price: 450, image: '/images/chicken-plov.png', tag: 'Пряная середина недели', calories: 710,
    dishes: [{ name: 'Чечевичный суп с томатами', weight: 300 }, { name: 'Плов с курицей и морковью', weight: 350 }, { name: 'Салат из томатов и красного лука', weight: 100 }],
    ingredients: 'Курица, рис, морковь, лук, чечевица, томаты, красный лук, петрушка, зира, растительное масло, соль.',
    allergens: 'На кухне используются молоко, пшеница, яйца, рыба и орехи.',
  },
  {
    id: 'hake-couscous', name: 'Рыба с кускусом', description: 'Хек с кабачком, крем-суп из брокколи и свежий салат',
    price: 550, image: '/images/hake-couscous.png', tag: 'Лёгкая среда', calories: 600,
    dishes: [{ name: 'Крем-суп из брокколи', weight: 300 }, { name: 'Запечённый хек с кускусом и кабачком', weight: 350 }, { name: 'Салат из огурца и редиса', weight: 100 }],
    ingredients: 'Хек, кускус, кабачок, брокколи, сливки, лук, огурец, редис, укроп, растительное масло, соль.',
    allergens: 'Рыба, пшеница (глютен), молоко. На кухне используются яйца и орехи.',
  },
  {
    id: 'chicken-cutlet', name: 'Котлеты с пюре', description: 'Куриные котлеты, домашние щи и винегрет',
    price: 450, image: '/images/chicken-cutlet.png', tag: 'Как дома', calories: 700,
    dishes: [{ name: 'Щи из свежей капусты', weight: 300 }, { name: 'Куриные котлеты с картофельным пюре', weight: 350 }, { name: 'Винегрет', weight: 100 }],
    ingredients: 'Курица, картофель, молоко, сливочное масло, яйцо, пшеничные сухари, капуста, морковь, лук, свёкла, зелёный горошек, солёный огурец, растительное масло, соль.',
    allergens: 'Молоко, яйца, пшеница (глютен). На кухне используются рыба и орехи.',
  },
  {
    id: 'beef-stroganoff', name: 'Бефстроганов с рисом', description: 'Говядина в сливочном соусе, рассольник и овощной салат',
    price: 500, image: '/images/beef-stroganoff.png', tag: 'Сытный четверг', calories: 750,
    dishes: [{ name: 'Рассольник с перловкой', weight: 300 }, { name: 'Бефстроганов с рисом и грибами', weight: 350 }, { name: 'Салат из томатов и сладкого перца', weight: 100 }],
    ingredients: 'Говядина, рис, шампиньоны, сливки, лук, перловая крупа, солёный огурец, картофель, морковь, томаты, сладкий перец, растительное масло, соль.',
    allergens: 'Молоко, ячмень (глютен). На кухне используются пшеница, яйца, рыба и орехи.',
  },
  {
    id: 'stuffed-peppers', name: 'Фаршированные перцы', description: 'Перцы с говядиной и рисом, овощной суп и капустный салат',
    price: 500, image: '/images/stuffed-peppers.png', tag: 'Пятничная классика', calories: 670,
    dishes: [{ name: 'Суп с цветной капустой', weight: 300 }, { name: 'Перцы с говядиной и рисом в томатном соусе', weight: 350 }, { name: 'Капустный салат с морковью', weight: 100 }],
    ingredients: 'Сладкий перец, говядина, рис, томаты, лук, цветная капуста, картофель, белокочанная капуста, морковь, растительное масло, соль.',
    allergens: 'На кухне используются молоко, пшеница, яйца, рыба и орехи.',
  },
  {
    id: 'chicken-mushroom', name: 'Курица с грибами', description: 'Курица с гречкой, морковный крем-суп и греческий салат',
    price: 550, image: '/images/chicken-mushroom.png', tag: 'Вкусный финал недели', calories: 730,
    dishes: [{ name: 'Морковный крем-суп', weight: 300 }, { name: 'Курица в грибном соусе с гречкой', weight: 350 }, { name: 'Греческий салат', weight: 100 }],
    ingredients: 'Курица, шампиньоны, сливки, гречка, морковь, лук, картофель, томаты, огурец, сыр, оливки, растительное масло, соль.',
    allergens: 'Молоко. На кухне используются пшеница, яйца, рыба и орехи.',
  },
];

// Номер дня недели: 1 — понедельник, 5 — пятница. Каждый комплект встречается один раз.
export const weeklyMenu: Readonly<Record<number, readonly string[]>> = {
  1: ['homestyle', 'classic', 'special'],
  2: ['turkey-bulgur', 'meatballs-pasta', 'pork-potatoes'],
  3: ['chicken-plov', 'hake-couscous'],
  4: ['chicken-cutlet', 'beef-stroganoff'],
  5: ['stuffed-peppers', 'chicken-mushroom'],
};

export function mealsForDate(date: string): Meal[] {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return (weeklyMenu[weekday] ?? []).flatMap((id) => {
    const meal = findMeal(id);
    return meal ? [meal] : [];
  });
}

export const isMealAvailable = (mealId: string, date: string) => mealsForDate(date).some((meal) => meal.id === mealId);

export function findMeal(id: string) {
  return meals.find((meal) => meal.id === id);
}

export const money = (amount: number) => `${new Intl.NumberFormat('ru-RU').format(amount)} ₽`;

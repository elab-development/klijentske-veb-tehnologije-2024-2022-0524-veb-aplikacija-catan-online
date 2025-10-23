export type Board = {
  id: string;
  name: string;
  description: string;
  image: string;
  minPlayers: number;
  maxPlayers: number;
  minTimeLimit: number;
  maxTimeLimit?: number;
  age: number;
};

export const boards: Board[] = [
  {
    id: 'catan',
    name: 'Catan',
    description:
      'Imagine yourself in the Age of Discovery: after a long voyage of sacrifice, your ships have at last reached the shore of an uncharted island. Its name shall be—Catan!',
    image: '/boxes/base-game.png',
    minPlayers: 3,
    maxPlayers: 4,
    minTimeLimit: 60,
    maxTimeLimit: 90,
    age: 10,
  },
  {
    id: 'dawn-of-humankind',
    name: 'Catan - Dawn of Humankind',
    description:
      'In the Dawn of Humankind, you will lead a branch of the human family to gather resources, migrate, and settle new regions—all while advancing its technology and culture. The adventure begins now!',
    image: '/boxes/dawn-of-humankind.png',
    minPlayers: 3,
    maxPlayers: 4,
    minTimeLimit: 90,
    age: 12,
  },
  {
    id: 'rise-of-inkas',
    name: 'Catan - Rise of the Inkas',
    description:
      'Guide the rise and fall of civilizations in Peru’s coastal and mountainous regions across three historical eras in this standalone game from the CATAN Histories series.',
    image: '/boxes/rise-of-inkas.png',
    minPlayers: 3,
    maxPlayers: 4,
    minTimeLimit: 90,
    age: 12,
  },
  {
    id: 'game-of-thrones',
    name: 'Catan - A Game of Thrones',
    description:
      'You take on the role of the Night’s Watch, using resources to strengthen your control over the North—building roads, settlements, and fortifications, recruiting guards for patrols, or purchasing development cards.',
    image: '/boxes/game-of-thrones.png',
    minPlayers: 3,
    maxPlayers: 4,
    minTimeLimit: 60,
    maxTimeLimit: 90,
    age: 14,
  },
  {
    id: 'starfarers',
    name: 'Catan - Starfarers',
    description:
      'At last—the leap to the stars has succeeded! It is the mid–third millennium. You and your fellow Catanians travel by starship to distant planetary systems in search of new resources.',
    image: '/boxes/starfarers.png',
    minPlayers: 3,
    maxPlayers: 4,
    minTimeLimit: 120,
    age: 14,
  },
];

export const findBoardById = (id: string): Board | undefined => {
  return boards.find((board) => board.id === id);
};

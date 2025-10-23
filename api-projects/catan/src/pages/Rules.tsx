import CatanHeroImg from '../assets/images/catan-hero.png';
import TilesImg from '../assets/images/rules/tiles.png';
import SettlementImg from '../assets/images/rules/settlement.png';
import RoadImg from '../assets/images/rules/road.png';
import BoardImg from '../assets/images/rules/table.png';
import CardsImg from '../assets/images/rules/cards.png';
import DicesImg from '../assets/images/rules/dices.png';
import DevelopmentImg from '../assets/images/rules/development.png';
import RobberImg from '../assets/images/rules/robber.png';
import DevCardsImg from '../assets/images/rules/devcards.png';

const Rules = () => {
  return (
    <div>
      <img
        src={CatanHeroImg}
        alt='Catan Hero'
        className='w-full h-auto object-cover'
      />
      <div className='bg-[linear-gradient(to_bottom,#08151F,#215B85,#215B85)] w-full flex flex-col py-10 '>
        <div className='max-w-3xl mx-auto px-2'>
          <h2 className='text-white text-2xl '>
            🧩 The basic idea of the game
          </h2>
          <p className='text-white/70 text-lg mt-4 pl-4'>
            Catan is a board game for 3–4 players (or more with expansions) in
            which you settle the island of Catan, build settlements, cities, and
            roads, trade resources, and plan strategically to be the first to
            reach 10 victory points.
          </p>
          <h3 className='text-white text-xl mt-8 pl-2'>🗺️ 1. Game setup</h3>
          <p className='text-white/70 text-lg mt-2 pl-6'>
            The game is played on a hex board with 19 tiles (forest, pasture,
            fields, hills, mountains, desert).
          </p>
          <img src={TilesImg} alt='tiles' className='w-1/2 pl-6' />
          <p className='text-white/70 text-lg my-2 pl-6'>
            Each player places 2 settlements and 2 roads before the game starts.
          </p>
          <div className='flex pl-6 w-full flex-wrap'>
            <img src={SettlementImg} alt='orange-settlment' className='w-1/4' />
            <img src={SettlementImg} alt='orange-settlment' className='w-1/4' />
            <img src={RoadImg} alt='orange-road' className='w-1/4' />
            <img src={RoadImg} alt='orange-road' className='w-1/4' />
          </div>
          <p className='text-white/70 text-lg my-2 pl-6'>
            Number tokens (2–12) are placed on each tile except the desert.
          </p>
          <img src={BoardImg} alt='board' className='w-1/2 pl-6' />
          <p className='text-white/70 text-lg my-2 pl-6'>
            Starting resources: you receive resources from the tiles your
            settlement touches (brick, wood, sheep, wheat, ore).
          </p>
          <img src={CardsImg} alt='cards' className='w-1/2 pl-6' />

          <h3 className='text-white text-xl mt-8 pl-2'>🔄 2. Turn structure</h3>
          <p className='text-white/70 text-lg my-2 pl-6'>
            Each turn has three phases:
          </p>
          <p className='text-white/70 text-lg my-2 pl-10'>
            Roll the dice 🎲 – all players collect resources from tiles with the
            rolled number.
          </p>
          <img src={DicesImg} alt='dices' className='w-1/2 pl-6' />
          <p className='text-white/70 text-lg my-2 pl-10'>
            Trade 🔁 – you can trade with other players or with the “bank” (4:1,
            or better if you have a harbor).
          </p>
          <img
            src={DevelopmentImg}
            alt='develpoment-card'
            className='w-1/2 pl-6'
          />
          <p className='text-white/70 text-lg my-2 pl-10'>
            Build 🏗️ – spend resources to build:
            <ul className='list-disc pl-10'>
              <li>Roads (wood + brick)</li>
              <li>Settlements (wood + brick + wheat + sheep)</li>
              <li>Cities (2 wheat + 3 ore)</li>
              <li>Development cards (wheat + ore + sheep)</li>
            </ul>
          </p>

          <h3 className='text-white text-xl mt-8 pl-2'>🛡️ 3. The Robber</h3>
          <p className='text-white/70 text-lg my-2 pl-6'>
            If a 7 is rolled, no one receives resources.
          </p>
          <p className='text-white/70 text-lg my-2 pl-6'>
            The active player moves the robber to a tile and may steal one
            resource from a player with a settlement/city adjacent to that tile.
          </p>
          <img src={RobberImg} alt='robber' className='w-1/2 pl-6' />
          <p className='text-white/70 text-lg my-2 pl-6'>
            Players holding more than 7 cards must discard half of their
            resources.
          </p>

          <h3 className='text-white text-xl mt-8 pl-2'>🏆 4. How to win</h3>
          <p className='text-white/70 text-lg my-2 pl-6'>
            The first player to reach 10 points wins! Points are earned by:
          </p>
          <img src={DevCardsImg} alt='devcards' className='w-1/2 pl-6' />
          <p className='text-white/70 text-lg my-2 pl-10'>
            <ul className='list-disc pl-10'>
              <li>🏠 1 point per settlement</li>
              <li>🏙️ 2 points per city</li>
              <li>
                📜 Hidden development cards (Knights, Victory Point cards)
              </li>
              <li>🚧 Longest Road (2 points — min. 5 roads)</li>
              <li>🛡️ Largest Army (2 points — min. 3 knights)</li>
            </ul>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Rules;

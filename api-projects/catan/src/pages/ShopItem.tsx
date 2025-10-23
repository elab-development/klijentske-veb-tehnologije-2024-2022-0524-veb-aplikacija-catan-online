import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { findBoardById, type Board } from '../assets/data';

const ShopItem = () => {
  const [board, setBoard] = useState<Board | undefined>(undefined);
  const { id } = useParams<{ id: string }>();

  useEffect(() => {
    if (id) {
      setBoard(findBoardById(id));
    }
  }, [id]);

  if (!board) {
    return (
      <div className='h-screen w-screen flex items-center justify-center'>
        Game not found!
      </div>
    );
  }

  const players = `${board.minPlayers}–${board.maxPlayers}`;
  const time = board.maxTimeLimit
    ? `${board.minTimeLimit}–${board.maxTimeLimit} min`
    : `${board.minTimeLimit} min`;
  const age = `${board.age}+`;

  return (
    <div className='min-h-screen w-full bg-[linear-gradient(to_bottom,#08151F,#215B85,#215B85)]'>
      <div className='max-w-5xl mx-auto px-4 py-10'>
        <div className='grid md:grid-cols-2 items-center gap-8'>
          <div className='w-full flex justify-center'>
            <img
              src={board.image}
              alt={board.name}
              className='w-full max-w-sm md:max-w-md h-auto object-contain rounded-xl shadow-2xl'
            />
          </div>

          <div className='text-white'>
            <h1 className='text-3xl md:text-4xl font-semibold'>{board.name}</h1>
            <p className='mt-4 text-white/90'>{board.description}</p>

            <div className='mt-6 grid grid-cols-3 gap-3'>
              <div className='rounded-lg bg-white/10 p-3 text-center'>
                <div className='text-xs uppercase tracking-wide text-white/70'>
                  Players
                </div>
                <div className='text-xl font-medium'>{players}</div>
              </div>
              <div className='rounded-lg bg-white/10 p-3 text-center'>
                <div className='text-xs uppercase tracking-wide text-white/70'>
                  Time
                </div>
                <div className='text-xl font-medium'>{time}</div>
              </div>
              <div className='rounded-lg bg-white/10 p-3 text-center'>
                <div className='text-xs uppercase tracking-wide text-white/70'>
                  Age
                </div>
                <div className='text-xl font-medium'>{age}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShopItem;

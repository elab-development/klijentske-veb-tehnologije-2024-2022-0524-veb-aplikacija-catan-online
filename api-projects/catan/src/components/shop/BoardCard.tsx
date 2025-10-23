import { Link } from 'react-router-dom';
import type { Board } from '../../assets/data';

type BoardCardProps = {
  board: Board;
};

const BoardCard = ({ board }: BoardCardProps) => {
  return (
    <Link to={`/shop/${board.id}`}>
      <div className='border-[#FCDE07] border-2 rounded-2xl gap-8 p-10 flex flex-col items-center justify-center'>
        <h2 className='text-white text-xl sm:text-5xl text-center'>
          {board.name}
        </h2>
        <img src={board.image} className='w-2/3 sm:w-4/5' />
      </div>
    </Link>
  );
};

export default BoardCard;

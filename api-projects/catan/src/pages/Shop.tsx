import { boards } from '../assets/data';
import CatanHeroImg from '../assets/images/catan-hero.png';
import BoardCard from '../components/shop/BoardCard';

const Shop = () => {
  return (
    <div>
      <img
        src={CatanHeroImg}
        alt='Catan Hero'
        className='w-full h-auto object-cover'
      />
      <div className='bg-[linear-gradient(to_bottom,#08151F,#215B85,#215B85)] w-full flex flex-col justify-center items-center py-10 '>
        <div className='max-w-3xl mx-auto px-2 flex flex-col gap-4'>
          {boards.map((board) => (
            <BoardCard key={board.id} board={board} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Shop;

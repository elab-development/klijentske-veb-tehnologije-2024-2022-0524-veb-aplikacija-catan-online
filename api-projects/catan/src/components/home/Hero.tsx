import { Link } from 'react-router-dom';
import CatanHeroImg from '../../assets/images/catan-hero.png';
import CatanLogoImg from '../../assets/images/catan-logo.png';

const Hero = () => {
  return (
    <div>
      <img
        src={CatanHeroImg}
        alt='Catan Hero'
        className='w-full h-auto object-cover'
      />
      <div className='bg-[linear-gradient(to_bottom,#08151F,#215B85,#215B85)] w-full flex justify-center items-center flex-col py-10 gap-6'>
        <img src={CatanLogoImg} alt='Catan Logo' className='max-w-[380px]' />
        <h2 className='text-white text-2xl text-center'>
          Explore the world of CATAN – where your strategic adventure begins!
        </h2>
        <Link
          to={'/game'}
          className='bg-[#FCDE07] shadow-2xl px-4 py-2 text-xl rounded-2xl border-2 trajanpro-bold'
        >
          Play Now
        </Link>
      </div>
    </div>
  );
};

export default Hero;

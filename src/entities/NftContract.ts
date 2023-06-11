import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

//길이가 긴 타입은 mediumtext로 설정, 최대 6만 5천 글짜까지 담을수 있음
@Entity()
export class NftContract {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  contractAddress: string;

  @Column({ nullable: true })
  name: string;

  @Column({ type: 'mediumtext', nullable: true })
  description: string;

  @Column({ type: 'mediumtext', nullable: true })
  image: string;

  @Column()
  symbol: string;

  @Column()
  totalSupply: string;

  //컨트랙트의 모든 nft 정보를 모두 가져오면 true
  @Column()
  synced: boolean;
}

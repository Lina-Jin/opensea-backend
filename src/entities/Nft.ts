import { NftProperty } from './NftProperty';
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Nft {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  creatorAddress: string;

  @Column()
  contractAddress: string;

  @Column()
  tokenId: string;

  @Column()
  isLazy: boolean;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  image: string;

  //하나의 nft에 여러개의 nftproperty가 있으므로 두개 테이블을 on to many와 many to one 으로 연결
  @OneToMany((type) => NftProperty, (nftProperty) => nftProperty.nft, {
    cascade: ['insert', 'update'],
  })
  properties: NftProperty[];
}

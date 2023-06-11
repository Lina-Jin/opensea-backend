import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Nft } from './Nft';

@Entity()
export class NftProperty {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  propertyKey: string;

  @Column()
  value: string;
  //하나의 nft에 여러개의 nftproperty가 있으므로 두개 테이블을 one to many와 many to one 으로 연결
  @ManyToOne((type) => Nft, (nft) => nft.properties)
  nft: Nft;
}

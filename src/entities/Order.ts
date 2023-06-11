import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  //솔리디티에서 정의한 order 구조체 데이터를 json형태로 저장하는 필드
  @Column({ type: 'mediumtext' }) //데이터 글자수가 많으므로 mediumtext로 타입 지정
  raw: string;

  @Column()
  isSell: boolean;

  @Column({ nullable: true })
  signature: string;

  @Column()
  maker: string;

  @Column()
  price: string; //price타입이 unit256이므로 오버플로우 방지를 위해 string으로 지정

  @Column()
  contractAddress: string;

  @Column()
  tokenId: string; //tokenId 타입이 unit256이므로 오버플로우 방지를 위해 string으로 지정

  @Column()
  expirationTime: number;

  //주문 검증 여부
  @Column()
  verified: boolean;
}

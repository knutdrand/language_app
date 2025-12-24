#!/usr/bin/env python3
"""Add tourist vocabulary to words.json, skipping duplicates."""

import json
from pathlib import Path

# New tourist words with Unsplash images
# Format: (vietnamese, english, unsplash_photo_id)
NEW_WORDS = [
    # Greetings & Basics (some already exist)
    ("vâng", "yes", "photo-1517457373958-b7bdd4587205"),
    ("chúng tôi", "we", "photo-1529156069898-49953e39b3ac"),
    ("ông", "grandfather/sir", "photo-1566616213894-2d4e1baee5d8"),
    ("bà", "grandmother/madam", "photo-1581579438747-104c53e81b89"),

    # Numbers (most exist, adding missing)
    ("một trăm", "one hundred", "photo-1516383740770-fbcc5ccbece0"),
    ("một nghìn", "one thousand", "photo-1554224155-6726b3ff858f"),
    ("một triệu", "one million", "photo-1526304640581-d334cdbbf45e"),
    ("nửa", "half", "photo-1509440159596-0249088772ff"),
    ("đôi", "pair", "photo-1542291026-7eec264c27ff"),

    # Food (adding missing)
    ("bún", "rice vermicelli", "photo-1582878826629-29b7ad1cdc43"),
    ("gạo", "uncooked rice", "photo-1586201375761-83865001e31c"),
    ("thịt bò", "beef", "photo-1588168333986-5078d3ae3976"),
    ("thịt gà", "chicken meat", "photo-1587593810167-a84920ea0781"),
    ("thịt heo", "pork", "photo-1602470521006-aaea8b2a6a13"),
    ("tôm", "shrimp", "photo-1565680018434-b513d5e5fd47"),
    ("cua", "crab", "photo-1510130387422-82bed34b37e9"),
    ("xà lách", "lettuce/salad", "photo-1556801712-76c8eb07bbc9"),
    ("cà chua", "tomato", "photo-1546470427-f5c7193e15c6"),
    ("dưa chuột", "cucumber", "photo-1449300079323-02e209d9d3a6"),
    ("hành", "onion", "photo-1518977956812-cd3dbadaaf31"),
    ("tỏi", "garlic", "photo-1540148426945-6cf22a6b2a79"),
    ("ớt", "chili", "photo-1526346698789-22fd84314424"),
    ("nước mắm", "fish sauce", "photo-1590779033100-9f60a05a013d"),
    ("muối", "salt", "photo-1518110925495-5fe2f8355b02"),
    ("đường", "sugar", "photo-1558642452-9d2a7deb7f62"),
    ("tiêu", "pepper", "photo-1599909533681-74a182bfad79"),
    ("bánh", "cake/pastry", "photo-1578985545062-69928b1d9587"),
    ("xôi", "sticky rice", "photo-1626804475297-41608ea09aeb"),
    ("chả giò", "spring roll", "photo-1544025162-d76694265947"),
    ("gỏi cuốn", "fresh spring roll", "photo-1562967915-92ae0c320a01"),
    ("cháo", "rice porridge", "photo-1604329760661-e71dc83f8f26"),

    # Fruits (adding missing)
    ("xoài", "mango", "photo-1553279768-865429fa0078"),
    ("chuối", "banana", "photo-1571771894821-ce9b6c11b08e"),
    ("dừa", "coconut", "photo-1560769629-975ec94e6a86"),
    ("dứa", "pineapple", "photo-1550258987-190a2d41a8ba"),
    ("cam", "orange", "photo-1547514701-42782101795e"),
    ("bưởi", "pomelo", "photo-1577234286642-fc512a5f8f11"),
    ("đu đủ", "papaya", "photo-1517282009859-f000ec3b26fe"),
    ("thanh long", "dragon fruit", "photo-1527325678964-54921661f888"),
    ("măng cụt", "mangosteen", "photo-1596591868264-1fba4a7b46e8"),
    ("sầu riêng", "durian", "photo-1588690214836-af5c4a7cf8c0"),
    ("chôm chôm", "rambutan", "photo-1609246232490-a9e7f5ac62c5"),
    ("dưa hấu", "watermelon", "photo-1563114773-84221bd62daa"),
    ("nho", "grapes", "photo-1537640538966-79f369143f8f"),
    ("táo", "apple", "photo-1560806887-1e4cd0b6cbd6"),

    # Drinks (adding missing)
    ("rượu", "wine/alcohol", "photo-1510812431401-41d2bd2722f3"),
    ("nước dừa", "coconut water", "photo-1525385133512-2f3bdd039054"),
    ("nước mía", "sugarcane juice", "photo-1558857563-b371033873b8"),
    ("sinh tố", "smoothie", "photo-1505252585461-04db1eb84625"),
    ("nước đá", "ice", "photo-1459131753325-d145a4e53df6"),
    ("nước chanh", "lemonade", "photo-1621263764928-df1444c5e859"),
    ("trà đá", "iced tea", "photo-1556679343-c7306c1976bc"),

    # Restaurant (adding missing)
    ("nhà hàng", "restaurant", "photo-1517248135467-4c7edcad34c4"),
    ("quán ăn", "eatery", "photo-1555396273-367ea4eb4db5"),
    ("thực đơn", "menu", "photo-1568901346375-23c9450c58cd"),
    ("đũa", "chopsticks", "photo-1569058242567-93de6f36f8eb"),
    ("thìa", "spoon", "photo-1591639458011-fe650a22b3e7"),
    ("dĩa", "plate/fork", "photo-1603199506016-5d54ebf01d84"),
    ("ly", "glass", "photo-1481671703460-040cb8a2d909"),
    ("tô", "bowl", "photo-1578913598049-8d9f4cccf998"),

    # Transportation (adding missing)
    ("xe máy", "motorbike", "photo-1558618666-fcd25c85cd64"),
    ("xe ô tô", "car", "photo-1494976388531-d1058494ceb8"),
    ("xe buýt", "bus", "photo-1570125909232-eb263c188f7e"),
    ("xe taxi", "taxi", "photo-1559829604-f4e4f2b85c3c"),
    ("máy bay", "airplane", "photo-1436491865332-7a61a109cc05"),
    ("thuyền", "boat", "photo-1544551763-46a013bb70d5"),
    ("bến xe", "bus station", "photo-1570125909517-53cb21c89ff2"),
    ("sân bay", "airport", "photo-1436491865332-7a61a109cc05"),
    ("ga tàu", "train station", "photo-1474487548417-781cb71495f3"),
    ("bến cảng", "port", "photo-1532649538693-f3a2ec1bf8bd"),
    ("vé", "ticket", "photo-1559526324-593bc073d938"),

    # Places (adding missing)
    ("khách sạn", "hotel", "photo-1566073771259-6a8506099945"),
    ("nhà nghỉ", "guesthouse", "photo-1520250497591-112f2f40a3f4"),
    ("phòng", "room", "photo-1522771739844-6a9f6d5f14af"),
    ("nhà vệ sinh", "bathroom/toilet", "photo-1552321554-5fefe8c9ef14"),
    ("siêu thị", "supermarket", "photo-1604719312566-8912e9227c6a"),
    ("cửa hàng", "shop/store", "photo-1441986300917-64674bd600d8"),
    ("ngân hàng", "bank", "photo-1501167786227-4cba60f6d58f"),
    ("bệnh viện", "hospital", "photo-1519494026892-80bbd2d6fd0d"),
    ("nhà thuốc", "pharmacy", "photo-1576602976047-174e57a47881"),
    ("bưu điện", "post office", "photo-1529271230144-e8c648ef570d"),
    ("bãi biển", "beach", "photo-1507525428034-b723cf961d3e"),
    ("chùa", "pagoda/temple", "photo-1528181304800-259b08848526"),
    ("nhà thờ", "church", "photo-1548625149-fc4a29cf7092"),
    ("công viên", "park", "photo-1519331379826-f10be5486c6f"),
    ("bảo tàng", "museum", "photo-1554907984-15263bfd63bd"),

    # Directions (adding missing)
    ("trái", "left", "photo-1516589091380-5d8e87df6999"),
    ("thẳng", "straight", "photo-1507525428034-b723cf961d3e"),
    ("gần", "near", "photo-1489824904134-891ab64532f1"),
    ("xa", "far", "photo-1475924156734-496f6cac6ec1"),
    ("đây", "here", "photo-1517457373958-b7bdd4587205"),
    ("đó", "there", "photo-1475924156734-496f6cac6ec1"),
    ("bản đồ", "map", "photo-1524661135-423995f22d0b"),
    ("địa chỉ", "address", "photo-1582738411706-bfc8e691d1c2"),
    ("lối vào", "entrance", "photo-1558618666-fcd25c85cd64"),

    # Shopping & Money (adding missing)
    ("đắt", "expensive", "photo-1515955656352-a1fa3ffcd111"),
    ("trả giá", "bargain", "photo-1556742049-0cfed4f6a45d"),
    ("hóa đơn", "bill/receipt", "photo-1554224155-8d04cb21cd6e"),
    ("thẻ", "card", "photo-1556742111-a301076d9d18"),
    ("đổi tiền", "exchange money", "photo-1580519542036-c47de6196ba5"),
    ("quà", "gift", "photo-1549465220-1a8b9238cd48"),
    ("túi", "bag", "photo-1547949003-9792a18a2601"),
    ("áo", "shirt/top", "photo-1562157873-818bc0726f68"),
    ("quần", "pants", "photo-1542272604-787c3835535d"),

    # Time (adding missing)
    ("ngày mai", "tomorrow", "photo-1506905925346-21bda4d32df4"),
    ("hôm qua", "yesterday", "photo-1506905925346-21bda4d32df4"),
    ("trưa", "noon", "photo-1495616811223-4d98c6e9c869"),
    ("chiều", "afternoon", "photo-1495616811223-4d98c6e9c869"),
    ("tối", "evening", "photo-1507400492013-162706c8c05e"),
    ("đêm", "night", "photo-1507400492013-162706c8c05e"),
    ("phút", "minute", "photo-1524678606370-a47ad25cb82a"),
    ("tuần", "week", "photo-1506784983877-45594efa4cbe"),
    ("tháng", "month", "photo-1506784983877-45594efa4cbe"),

    # Weather (adding missing)
    ("nóng", "hot", "photo-1504370805625-d32c54b16100"),
    ("lạnh", "cold", "photo-1491002052546-bf38f186af56"),
    ("mưa", "rain", "photo-1519692933481-e162a57d6721"),
    ("nắng", "sunny", "photo-1504370805625-d32c54b16100"),
    ("gió", "wind", "photo-1527482797697-8795b05a13fe"),
    ("mây", "cloud", "photo-1534088568595-a066f410bcda"),
    ("ẩm", "humid", "photo-1501630834273-4b5604d2ee31"),
    ("khô", "dry", "photo-1509316785289-025f5b846b35"),

    # Common Adjectives (adding missing)
    ("tốt", "good", "photo-1516585427167-9f4af9627e6c"),
    ("xấu", "bad", "photo-1516585427167-9f4af9627e6c"),
    ("ngon", "delicious", "photo-1414235077428-338989a2e8c0"),
    ("lớn", "big", "photo-1560807707-8cc77767d783"),
    ("nhỏ", "small", "photo-1560807707-8cc77767d783"),
    ("cũ", "old (things)", "photo-1518893063132-36e46dbe2428"),
    ("nhanh", "fast", "photo-1494905998402-395d579af36f"),
    ("chậm", "slow", "photo-1517483000871-1dbf64a6e1c6"),
    ("sạch", "clean", "photo-1584568694244-14fbdf83bd30"),
    ("bẩn", "dirty", "photo-1584568694244-14fbdf83bd30"),
    ("cay", "spicy", "photo-1526346698789-22fd84314424"),
    ("ngọt", "sweet", "photo-1558642452-9d2a7deb7f62"),
    ("mặn", "salty", "photo-1518110925495-5fe2f8355b02"),

    # Emergency & Health (adding missing)
    ("cấp cứu", "emergency", "photo-1587745416684-47953f16f02f"),
    ("cảnh sát", "police", "photo-1589994160839-163cd867cfe8"),
    ("bác sĩ", "doctor", "photo-1612349317150-e413f6a5b16d"),
    ("thuốc", "medicine", "photo-1584308666744-24d5c474f2ae"),
    ("đau", "pain", "photo-1584515979956-d9f6e5d09982"),
    ("ốm", "sick", "photo-1576091160399-112ba8d25d1d"),
    ("giúp đỡ", "help", "photo-1582213782179-e0d53f98f2ca"),
    ("nguy hiểm", "dangerous", "photo-1551269901-5c5e14c25df7"),

    # Additional useful tourist words
    ("đẹp quá", "so beautiful", "photo-1469474968028-56623f02e42e"),
    ("cảm ơn nhiều", "thank you very much", "photo-1517457373958-b7bdd4587205"),
    ("xin lỗi", "excuse me", "photo-1517457373958-b7bdd4587205"),
    ("tôi", "I/me", "photo-1507003211169-0a1dd7228f2d"),
    ("wifi", "wifi", "photo-1516044734145-07ca8eef8731"),
    ("internet", "internet", "photo-1516044734145-07ca8eef8731"),
    ("điện", "electricity", "photo-1473341304170-971dccb5ac1e"),
    ("nóng quá", "too hot", "photo-1504370805625-d32c54b16100"),
    ("mệt", "tired", "photo-1494253109108-2e30c049369b"),
    ("đói", "hungry", "photo-1571748982800-fa51082c2224"),
    ("khát", "thirsty", "photo-1523362628745-0c100150b504"),
    ("no", "full (stomach)", "photo-1414235077428-338989a2e8c0"),
    ("vui vẻ", "happy", "photo-1489710437720-ebb67ec84dd2"),
    ("buồn", "sad", "photo-1516585427167-9f4af9627e6c"),
    ("sợ", "scared", "photo-1508243529287-e21d7f08a6d0"),
    ("yêu", "love", "photo-1516589091380-5d8e87df6999"),
    ("thương", "love/care", "photo-1516589091380-5d8e87df6999"),
    ("ăn", "eat", "photo-1504674900247-0877df9cc836"),
    ("uống", "drink", "photo-1544145945-f90425340c7e"),
    ("ngủ", "sleep", "photo-1531353826977-0941b4779a1c"),
    ("làm ơn", "please (polite)", "photo-1517457373958-b7bdd4587205"),
    ("cho tôi", "give me", "photo-1517457373958-b7bdd4587205"),
    ("ở đâu", "where", "photo-1524661135-423995f22d0b"),
    ("khi nào", "when", "photo-1524678606370-a47ad25cb82a"),
    ("tại sao", "why", "photo-1517457373958-b7bdd4587205"),
    ("như thế nào", "how", "photo-1517457373958-b7bdd4587205"),
    ("cái gì", "what", "photo-1517457373958-b7bdd4587205"),
    ("ai", "who", "photo-1507003211169-0a1dd7228f2d"),
    ("đắt quá", "too expensive", "photo-1515955656352-a1fa3ffcd111"),
    ("rẻ hơn", "cheaper", "photo-1556742049-0cfed4f6a45d"),
    ("bớt đi", "discount please", "photo-1556742049-0cfed4f6a45d"),
    ("tính tiền", "check please", "photo-1554224155-8d04cb21cd6e"),
    ("trả tiền", "pay", "photo-1580519542036-c47de6196ba5"),
    ("tiền mặt", "cash", "photo-1580519542036-c47de6196ba5"),
    ("đồng", "Vietnamese dong", "photo-1580519542036-c47de6196ba5"),
    ("đô la", "dollar", "photo-1580519542036-c47de6196ba5"),
    ("xe ôm", "motorbike taxi", "photo-1558618666-fcd25c85cd64"),
    ("grab", "Grab (ride app)", "photo-1559829604-f4e4f2b85c3c"),
    ("đi đâu", "where to go", "photo-1524661135-423995f22d0b"),
    ("dừng lại", "stop", "photo-1559829604-f4e4f2b85c3c"),
    ("quẹo trái", "turn left", "photo-1516589091380-5d8e87df6999"),
    ("quẹo phải", "turn right", "photo-1516589091380-5d8e87df6999"),
    ("chạy thẳng", "go straight", "photo-1507525428034-b723cf961d3e"),
    ("gần đây", "nearby", "photo-1489824904134-891ab64532f1"),
    ("tới", "arrive", "photo-1489824904134-891ab64532f1"),
    ("khởi hành", "depart", "photo-1436491865332-7a61a109cc05"),
    ("đặt phòng", "book room", "photo-1566073771259-6a8506099945"),
    ("phòng đôi", "double room", "photo-1522771739844-6a9f6d5f14af"),
    ("phòng đơn", "single room", "photo-1522771739844-6a9f6d5f14af"),
    ("điều hòa", "air conditioning", "photo-1527015175922-36a306cf0e20"),
    ("nước nóng", "hot water", "photo-1525385133512-2f3bdd039054"),
    ("khăn tắm", "towel", "photo-1576426863848-c21f53c60b19"),
    ("xà phòng", "soap", "photo-1584305574647-0cc949a2bb9f"),
    ("giấy vệ sinh", "toilet paper", "photo-1552321554-5fefe8c9ef14"),
    ("chìa khóa", "key", "photo-1558618047-3c8c76ca7d13"),
    ("thang máy", "elevator", "photo-1567359781514-3b964e2b04d6"),
    ("cầu thang", "stairs", "photo-1567359781514-3b964e2b04d6"),
    ("tầng", "floor/level", "photo-1567359781514-3b964e2b04d6"),
    ("lễ tân", "reception", "photo-1566073771259-6a8506099945"),
    ("hành lý", "luggage", "photo-1565026057447-bc90a3dceb87"),
    ("va li", "suitcase", "photo-1565026057447-bc90a3dceb87"),
    ("ba lô", "backpack", "photo-1553062407-98eeb64c6a62"),
    ("hộ chiếu", "passport", "photo-1544005313-94ddf0286df2"),
    ("visa", "visa", "photo-1544005313-94ddf0286df2"),
    ("nhập cảnh", "immigration", "photo-1436491865332-7a61a109cc05"),
    ("hải quan", "customs", "photo-1436491865332-7a61a109cc05"),
    ("lịch sử", "history", "photo-1554907984-15263bfd63bd"),
    ("văn hóa", "culture", "photo-1554907984-15263bfd63bd"),
    ("di tích", "heritage site", "photo-1528181304800-259b08848526"),
    ("cổ", "ancient/old", "photo-1528181304800-259b08848526"),
    ("truyền thống", "traditional", "photo-1528181304800-259b08848526"),
    ("hiện đại", "modern", "photo-1477959858617-67f85cf4f1df"),
    ("nông thôn", "countryside", "photo-1500382017468-9049fed747ef"),
    ("thành thị", "urban", "photo-1477959858617-67f85cf4f1df"),
    ("ruộng lúa", "rice field", "photo-1500382017468-9049fed747ef"),
    ("ao sen", "lotus pond", "photo-1536240478700-b869070f9279"),
    ("sen", "lotus", "photo-1536240478700-b869070f9279"),
    ("tre", "bamboo", "photo-1545378104-ce7b5e0c0f48"),
    ("nón lá", "conical hat", "photo-1557750255-c76072a7aee1"),
    ("áo dài", "traditional dress", "photo-1557750255-c76072a7aee1"),
    ("ẩm thực", "cuisine", "photo-1504674900247-0877df9cc836"),
    ("đặc sản", "specialty", "photo-1504674900247-0877df9cc836"),
    ("ngon lắm", "very delicious", "photo-1414235077428-338989a2e8c0"),
    ("không cay", "not spicy", "photo-1526346698789-22fd84314424"),
    ("ít cay", "less spicy", "photo-1526346698789-22fd84314424"),
    ("chay", "vegetarian", "photo-1512621776951-a57141f2eefd"),
    ("hải sản", "seafood", "photo-1565680018434-b513d5e5fd47"),
    ("đồ ăn", "food", "photo-1504674900247-0877df9cc836"),
    ("đồ uống", "drinks", "photo-1544145945-f90425340c7e"),
    ("thêm", "more/add", "photo-1517457373958-b7bdd4587205"),
    ("bớt", "less/reduce", "photo-1517457373958-b7bdd4587205"),
    ("đủ rồi", "enough", "photo-1517457373958-b7bdd4587205"),
    ("chờ", "wait", "photo-1524678606370-a47ad25cb82a"),
    ("nhanh lên", "hurry up", "photo-1494905998402-395d579af36f"),
    ("từ từ", "slowly", "photo-1517483000871-1dbf64a6e1c6"),
    ("cẩn thận", "careful", "photo-1551269901-5c5e14c25df7"),
    ("an toàn", "safe", "photo-1589994160839-163cd867cfe8"),
    ("nguy hiểm", "dangerous", "photo-1551269901-5c5e14c25df7"),
    ("cấm", "prohibited", "photo-1551269901-5c5e14c25df7"),
    ("cho phép", "allowed", "photo-1517457373958-b7bdd4587205"),
    ("miễn phí", "free (no cost)", "photo-1517457373958-b7bdd4587205"),
    ("có phí", "has fee", "photo-1554224155-8d04cb21cd6e"),
    ("mở cửa", "open", "photo-1441986300917-64674bd600d8"),
    ("đóng cửa", "closed", "photo-1441986300917-64674bd600d8"),
    ("giờ mở cửa", "opening hours", "photo-1524678606370-a47ad25cb82a"),
]

def main():
    # Read existing words
    words_file = Path("frontend/src/data/words.json")
    with open(words_file, "r", encoding="utf-8") as f:
        existing_words = json.load(f)

    # Get existing Vietnamese words (normalized)
    existing_vietnamese = {w["vietnamese"].lower().strip() for w in existing_words}

    # Get next ID
    next_id = max(w["id"] for w in existing_words) + 1

    # Add new words
    added = 0
    skipped = 0
    for vietnamese, english, photo_id in NEW_WORDS:
        if vietnamese.lower().strip() in existing_vietnamese:
            print(f"Skipping duplicate: {vietnamese}")
            skipped += 1
            continue

        new_word = {
            "id": next_id,
            "vietnamese": vietnamese,
            "english": english,
            "imageUrl": f"https://images.unsplash.com/{photo_id}?w=400"
        }
        existing_words.append(new_word)
        existing_vietnamese.add(vietnamese.lower().strip())
        next_id += 1
        added += 1
        print(f"Added: {vietnamese} ({english})")

    # Write back
    with open(words_file, "w", encoding="utf-8") as f:
        json.dump(existing_words, f, ensure_ascii=False, indent=2)

    print(f"\n✓ Added {added} new words, skipped {skipped} duplicates")
    print(f"Total words now: {len(existing_words)}")

if __name__ == "__main__":
    main()

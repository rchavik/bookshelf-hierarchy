DROP TABLE if exists nested_category;

CREATE TABLE nested_category (
	id INT AUTO_INCREMENT PRIMARY KEY,
	name VARCHAR(20) NOT NULL,
	parent_id INT,
	lft INT,
	rgt INT
);

INSERT INTO nested_category (id, name, lft, rgt)
VALUES
(1,'ELECTRONICS',1,20),
(2,'TELEVISIONS',2,9),
(3,'TUBE',3,4),
(4,'LCD',5,6),
(5,'PLASMA',7,8),
(6,'PORTABLE ELECTRONICS',10,19),
(7,'MP3 PLAYERS',11,14),
(8,'FLASH',12,13),
(9,'CD PLAYERS',15,16),
(10,'2 WAY RADIOS',17,18);

SELECT node.id, CONCAT( REPEAT('  ', COUNT(parent.name) - 1), node.name) AS name
  FROM nested_category AS node,
       nested_category AS parent
 WHERE node.lft BETWEEN parent.lft AND parent.rgt
 GROUP BY node.name, node.lft, node.id
 ORDER BY node.lft;
